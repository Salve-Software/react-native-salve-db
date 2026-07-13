#include "SyncOperationApplier.hpp"
#include <NitroModules/Null.hpp>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <unordered_map>

namespace margelo::nitro::salvedb {

namespace {

std::string primaryKeyColumn(SQLiteConnection& conn, const std::string& table) {
  auto result = conn.execute("PRAGMA table_info(\"" + table + "\")", {});
  for (auto& row : result.rows) {
    // PRAGMA table_info columns: cid, name, type, notnull, dflt_value, pk
    if (row.size() > 5 && std::get<double>(row[5]) != 0) {
      return std::get<std::string>(row[1]);
    }
  }
  throw std::runtime_error("SyncOperationApplier: no primary key found for table '" + table + "'");
}

SqlValue toSqlValue(const json::Value& v) {
  if (v.isNull())   return nitro::NullType();
  if (v.isBool())   return v.asBool();
  if (v.isNumber()) return v.asNumber();
  if (v.isString()) return v.asString();
  throw std::runtime_error("SyncOperationApplier: unsupported payload value type for a column");
}

} // namespace

SyncOperationApplier::SyncOperationApplier(std::shared_ptr<SQLiteConnection> conn)
  : _conn(std::move(conn)) {}

ApplyStats SyncOperationApplier::apply(const json::Array& operations) {
  ApplyStats stats;
  std::unordered_map<std::string, std::string> pkColumnByEntity;

  for (const auto& op : operations) {
    if (!op.isObject()) {
      throw std::runtime_error("SyncOperationApplier: each operation must be an object");
    }

    std::string operation = op.getString("operation");
    std::string entity    = op.getString("entity");
    std::string pkValue   = op.getString("primaryKey");
    double remoteUpdatedAt = op.getNumber("updatedAt");

    auto cached = pkColumnByEntity.find(entity);
    std::string pkCol = cached != pkColumnByEntity.end()
      ? cached->second
      : pkColumnByEntity.emplace(entity, primaryKeyColumn(*_conn, entity)).first->second;

    auto existing = _conn->execute(
      "SELECT updatedAt FROM \"" + entity + "\" WHERE \"" + pkCol + "\" = ?",
      { pkValue }
    );
    std::optional<double> localUpdatedAt;
    if (!existing.rows.empty()) localUpdatedAt = std::get<double>(existing.rows[0][0]);

    if (operation == "delete") {
      if (!localUpdatedAt || remoteUpdatedAt >= *localUpdatedAt) {
        _conn->execute("DELETE FROM \"" + entity + "\" WHERE \"" + pkCol + "\" = ?", { pkValue });
        if (localUpdatedAt) stats.deleted++;
      }
      continue;
    }

    // insert/update — lastWriteWins: skip if the incoming write is not newer than local.
    if (localUpdatedAt && remoteUpdatedAt <= *localUpdatedAt) continue;

    auto payloadRef = op.get("payload");
    if (!payloadRef || !payloadRef->get().isObject()) {
      throw std::runtime_error("SyncOperationApplier: payload for '" + entity + "' must be an object");
    }

    std::vector<std::string> columns;
    std::vector<SqlValue> values;
    for (auto& [col, val] : payloadRef->get().asObject()) {
      columns.push_back(col);
      values.push_back(toSqlValue(val));
    }

    std::ostringstream sql;
    if (!localUpdatedAt) {
      sql << "INSERT INTO \"" << entity << "\" (";
      for (size_t i = 0; i < columns.size(); ++i) { if (i) sql << ", "; sql << "\"" << columns[i] << "\""; }
      sql << ") VALUES (";
      for (size_t i = 0; i < columns.size(); ++i) { if (i) sql << ", "; sql << "?"; }
      sql << ")";
      _conn->execute(sql.str(), values);
      stats.inserted++;
    } else {
      sql << "UPDATE \"" << entity << "\" SET ";
      for (size_t i = 0; i < columns.size(); ++i) { if (i) sql << ", "; sql << "\"" << columns[i] << "\" = ?"; }
      sql << " WHERE \"" << pkCol << "\" = ?";
      values.push_back(pkValue);
      _conn->execute(sql.str(), values);
      stats.updated++;
    }
  }

  return stats;
}

} // namespace margelo::nitro::salvedb
