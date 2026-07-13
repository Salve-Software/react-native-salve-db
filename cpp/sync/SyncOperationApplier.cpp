#include "SyncOperationApplier.hpp"
#include <NitroModules/Null.hpp>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <unordered_map>
#include <unordered_set>

namespace margelo::nitro::salvedb {

namespace {

struct TableColumns {
  std::string primaryKey;
  std::unordered_set<std::string> all;
};

TableColumns describeTable(SQLiteConnection& conn, const std::string& table) {
  auto result = conn.execute("PRAGMA table_info(\"" + table + "\")", {});
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
  return cols;
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

ApplyStats SyncOperationApplier::apply(const std::string& expectedEntity, const json::Array& operations) {
  ApplyStats stats;
  std::unordered_map<std::string, TableColumns> columnsByEntity;

  for (const auto& op : operations) {
    if (!op.isObject()) {
      throw std::runtime_error("SyncOperationApplier: each operation must be an object");
    }

    std::string operation = op.getString("operation");
    std::string entity    = op.getString("entity");
    std::string pkValue   = op.getString("primaryKey");
    double remoteUpdatedAt = op.getNumber("updatedAt");

    if (entity != expectedEntity) {
      throw std::runtime_error(
        "SyncOperationApplier: operation entity '" + entity +
        "' does not match the schema being synced ('" + expectedEntity + "')"
      );
    }

    auto cached = columnsByEntity.find(entity);
    const TableColumns& cols = cached != columnsByEntity.end()
      ? cached->second
      : columnsByEntity.emplace(entity, describeTable(*_conn, entity)).first->second;
    const std::string& pkCol = cols.primaryKey;

    auto existing = _conn->execute(
      "SELECT updatedAt FROM \"" + entity + "\" WHERE \"" + pkCol + "\" = ?",
      { pkValue }
    );
    std::optional<double> localUpdatedAt;
    if (!existing.rows.empty()) localUpdatedAt = std::get<double>(existing.rows[0][0]);

    if (operation == "delete") {
      // lastWriteWins, same tie-break as insert/update below: local wins on a tie.
      if (!localUpdatedAt || remoteUpdatedAt > *localUpdatedAt) {
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
      if (cols.all.count(col) == 0) {
        throw std::runtime_error(
          "SyncOperationApplier: unknown column '" + col + "' for entity '" + entity + "'"
        );
      }
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
