#include "SyncOperationApplier.hpp"
#include "RelationCascadeRewriter.hpp"
#include "SyncQueueStore.hpp"
#include "../database/SalveMetadataManager.hpp"
#include <NitroModules/Null.hpp>
#include <chrono>
#include <optional>
#include <sstream>
#include <stdexcept>

namespace margelo::nitro::salvedb {

namespace {

SqlValue toSqlValue(const json::Value& v) {
  if (v.isNull())   return nitro::NullType();
  if (v.isBool())   return v.asBool();
  if (v.isNumber()) return v.asNumber();
  if (v.isString()) return v.asString();
  throw std::runtime_error("SyncOperationApplier: unsupported column value type");
}

// A server-assigned id may arrive as a JSON number or string; metadata stores it as TEXT.
// Reuses json::stringify's own number formatting so large integer ids don't
// round-trip through the default 6-digit stream precision into "1.5e+15".
std::string jsonScalarToString(const json::Value& v) {
  if (v.isString()) return v.asString();
  if (v.isNumber()) {
    std::ostringstream out;
    json::detail::stringifyNumber(v.asNumber(), out);
    return out.str();
  }
  throw std::runtime_error("SyncOperationApplier: primary key value must be a string or number");
}

std::optional<double> readOptionalNumber(const json::Value& obj, const std::string& key) {
  auto v = obj.get(key);
  if (!v || !v->get().isNumber()) return std::nullopt;
  return v->get().asNumber();
}

int64_t nowMillis() {
  return static_cast<int64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::system_clock::now().time_since_epoch()).count());
}

} // namespace

SyncOperationApplier::SyncOperationApplier(std::shared_ptr<SQLiteConnection> conn, SyncConflict conflict)
  : _conn(std::move(conn)), _conflict(std::move(conflict)) {}

const SyncOperationApplier::TableColumns& SyncOperationApplier::columnsFor(const std::string& table) {
  auto it = _columnsCache.find(table);
  if (it != _columnsCache.end()) return it->second;

  auto result = _conn->execute("PRAGMA table_info(\"" + table + "\")", {});
  TableColumns cols;
  for (auto& row : result.rows) {
    // PRAGMA table_info columns: cid, name, type, notnull, dflt_value, pk
    const std::string& name = std::get<std::string>(row[1]);
    cols.all.insert(name);
    if (row.size() > 5 && std::get<double>(row[5]) != 0) cols.primaryKey = name;
  }
  if (cols.primaryKey.empty()) {
    throw std::runtime_error("SyncOperationApplier: no primary key found for table '" + table + "'");
  }
  return _columnsCache.emplace(table, std::move(cols)).first->second;
}

ApplyStats SyncOperationApplier::apply(const std::string& expectedEntity, const json::Array& rows) {
  ApplyStats stats;
  if (rows.empty()) return stats;

  const TableColumns& cols = columnsFor(expectedEntity);
  const std::string& pkCol = cols.primaryKey;
  SalveMetadataManager metadata(_conn);
  int64_t now = nowMillis();

  for (const auto& row : rows) {
    if (!row.isObject()) {
      throw std::runtime_error("SyncOperationApplier: each pulled row must be an object");
    }

    auto pkRef = row.get(pkCol);
    if (!pkRef) {
      throw std::runtime_error("SyncOperationApplier: pulled row is missing primary key '" + pkCol + "'");
    }
    std::string pkValue = jsonScalarToString(pkRef->get());

    auto deletedAt = readOptionalNumber(row, "deletedAt");
    auto updatedAt = readOptionalNumber(row, _conflict.field);
    double remoteTimestamp = deletedAt.value_or(updatedAt.value_or(0));

    bool exists;
    std::optional<double> localTimestamp; // only meaningful for lastWriteWins
    if (_conflict.strategy == "lastWriteWins") {
      auto existing = _conn->execute(
        "SELECT \"" + _conflict.field + "\" FROM \"" + expectedEntity + "\" WHERE \"" + pkCol + "\" = ?",
        { pkValue }
      );
      exists = !existing.rows.empty();
      if (exists) localTimestamp = std::get<double>(existing.rows[0][0]);
    } else {
      auto existing = _conn->execute(
        "SELECT 1 FROM \"" + expectedEntity + "\" WHERE \"" + pkCol + "\" = ?",
        { pkValue }
      );
      exists = !existing.rows.empty();
    }

    // Tombstone: soft-delete locally per the configured conflict strategy.
    if (deletedAt.has_value()) {
      bool shouldDelete = _conflict.strategy == "serverWins" ? exists
        : _conflict.strategy == "clientWins" ? false
        : exists && remoteTimestamp > *localTimestamp; // lastWriteWins
      if (shouldDelete) {
        _conn->execute(
          "UPDATE \"" + expectedEntity + "\" SET \"deletedAt\" = ? WHERE \"" + pkCol + "\" = ?",
          { *deletedAt, pkValue }
        );
        stats.deleted++;
        metadata.markPulledSynced(expectedEntity, pkValue, "DELETED", now);
      }
      continue;
    }

    bool shouldApply = _conflict.strategy == "serverWins" ? true
      : _conflict.strategy == "clientWins" ? !exists
      : !exists || remoteTimestamp > *localTimestamp; // lastWriteWins
    if (!shouldApply) continue;

    std::vector<std::string> columns;
    std::vector<SqlValue> values;
    for (auto& [col, val] : row.asObject()) {
      if (cols.all.count(col) == 0) continue; // unknown server field — ignore, don't fail the page
      columns.push_back(col);
      // Canonical string form for the PK column, matching pkValue elsewhere — avoids a REAL/TEXT mismatch.
      values.push_back(col == pkCol ? SqlValue(pkValue) : toSqlValue(val));
    }

    std::ostringstream sql;
    if (!exists) {
      sql << "INSERT INTO \"" << expectedEntity << "\" (";
      for (size_t i = 0; i < columns.size(); ++i) { if (i) sql << ", "; sql << "\"" << columns[i] << "\""; }
      sql << ") VALUES (";
      for (size_t i = 0; i < columns.size(); ++i) { if (i) sql << ", "; sql << "?"; }
      sql << ")";
      _conn->execute(sql.str(), values);
      stats.inserted++;
    } else {
      sql << "UPDATE \"" << expectedEntity << "\" SET ";
      for (size_t i = 0; i < columns.size(); ++i) { if (i) sql << ", "; sql << "\"" << columns[i] << "\" = ?"; }
      sql << " WHERE \"" << pkCol << "\" = ?";
      values.push_back(pkValue);
      _conn->execute(sql.str(), values);
      stats.updated++;
    }

    metadata.markPulledSynced(expectedEntity, pkValue, "SYNCED", now);
  }

  return stats;
}

SyncOperationApplier::ReplaceIdentity SyncOperationApplier::recordRemoteSuccess(
    const std::string& expectedEntity, const std::string& localId, const json::Value& responseEntity) {
  SalveMetadataManager metadata(_conn);
  int64_t now = nowMillis();

  auto meta = metadata.getByLocalId(expectedEntity, localId);
  if (!meta) {
    throw std::runtime_error(
      "SyncOperationApplier: no metadata found for localId '" + localId + "' on entity '" + expectedEntity + "'"
    );
  }
  std::string oldEntityId = meta->entityId;

  // A 2xx with an empty body (server chose not to echo the entity) confirms the write without a PK to replace.
  if (!responseEntity.isObject()) {
    metadata.markReplaced(expectedEntity, localId, oldEntityId, now);
    return ReplaceIdentity{oldEntityId, oldEntityId};
  }

  const TableColumns& cols = columnsFor(expectedEntity);
  std::optional<std::string> newEntityId;
  auto pkField = responseEntity.get(cols.primaryKey);
  // Bind the same string form used below for cascade/metadata, rather than a raw double — SQLite's REAL->TEXT affinity would otherwise reformat a large id into scientific notation.
  if (pkField) newEntityId = jsonScalarToString(pkField->get());

  std::string resolvedEntityId = newEntityId.value_or(oldEntityId);
  metadata.markReplaced(expectedEntity, localId, resolvedEntityId, now);
  return ReplaceIdentity{oldEntityId, resolvedEntityId};
}

void SyncOperationApplier::rewriteLocalRow(const std::string& expectedEntity, const ReplaceIdentity& identity,
                                            const json::Value& responseEntity) {
  if (!responseEntity.isObject()) return;

  const TableColumns& cols = columnsFor(expectedEntity);
  std::vector<std::string> columns;
  std::vector<SqlValue> values;

  for (auto& [key, val] : responseEntity.asObject()) {
    if (cols.all.count(key) == 0 || key == cols.primaryKey) continue; // unknown field, or identity (handled below)
    columns.push_back(key);
    values.push_back(toSqlValue(val));
  }

  // PK rewrite is identity, not data — always applies, regardless of who wrote the other columns last.
  if (identity.resolvedEntityId != identity.oldEntityId) {
    _conn->execute(
      "UPDATE \"" + expectedEntity + "\" SET \"" + cols.primaryKey + "\" = ? WHERE \"" + cols.primaryKey + "\" = ?",
      { identity.resolvedEntityId, identity.oldEntityId }
    );
  }

  // The other columns are data: a concurrent local edit during this request's round-trip must win (lastWriteWins, mirroring apply()'s pull-side rule) — always, regardless of the schema's overall conflict strategy.
  if (!columns.empty()) {
    // A serverWins/clientWins schema isn't required to declare `_conflict.field` as a
    // column — skip the guard entirely rather than SELECTing a column that may not exist.
    auto responseUpdatedAt = cols.all.count(_conflict.field) > 0
      ? readOptionalNumber(responseEntity, _conflict.field)
      : std::nullopt;
    bool shouldApplyData = true;
    if (responseUpdatedAt.has_value()) {
      auto current = _conn->execute(
        "SELECT \"" + _conflict.field + "\" FROM \"" + expectedEntity + "\" WHERE \"" + cols.primaryKey + "\" = ?",
        { identity.resolvedEntityId }
      );
      if (!current.rows.empty()) {
        shouldApplyData = std::get<double>(current.rows[0][0]) <= *responseUpdatedAt;
      }
    }
    if (shouldApplyData) {
      std::ostringstream sql;
      sql << "UPDATE \"" << expectedEntity << "\" SET ";
      for (size_t i = 0; i < columns.size(); ++i) { if (i) sql << ", "; sql << "\"" << columns[i] << "\" = ?"; }
      sql << " WHERE \"" << cols.primaryKey << "\" = ?";
      values.push_back(identity.resolvedEntityId);
      _conn->execute(sql.str(), values);
    }
  }

  if (identity.resolvedEntityId != identity.oldEntityId) {
    RelationCascadeRewriter(_conn).rewrite(expectedEntity, identity.oldEntityId, identity.resolvedEntityId);
    SyncQueueStore(_conn).rewriteEntityId(expectedEntity, identity.oldEntityId, identity.resolvedEntityId);
  }
}

void SyncOperationApplier::confirmDeleted(const std::string& expectedEntity, const std::string& localId) {
  SalveMetadataManager(_conn).markDeletedSynced(expectedEntity, localId, nowMillis());
}

} // namespace margelo::nitro::salvedb
