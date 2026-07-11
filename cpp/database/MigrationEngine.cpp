#include "MigrationEngine.hpp"

#include <sstream>
#include <algorithm>
#include <stdexcept>

namespace margelo::nitro::salvedb {

MigrationEngine::MigrationEngine(std::shared_ptr<SQLiteConnection> conn)
  : _conn(std::move(conn)) {}

namespace {

// Rolls back on scope exit unless commit() ran, so a mid-sequence throw can't leave a half-applied migration.
class TransactionGuard {
public:
  explicit TransactionGuard(SQLiteConnection& conn) : _conn(conn) {
    _conn.beginTransaction();
  }

  TransactionGuard(const TransactionGuard&) = delete;
  TransactionGuard& operator=(const TransactionGuard&) = delete;

  ~TransactionGuard() {
    if (!_committed) {
      try {
        _conn.rollback();
      } catch (...) {
        // destructors must not throw
      }
    }
  }

  void commit() {
    _conn.commit();
    _committed = true;
  }

private:
  SQLiteConnection& _conn;
  bool _committed = false;
};

} // namespace

// ── Schema version table ─────────────────────────────────────────────────────

static constexpr auto kVersionTable = R"sql(
  CREATE TABLE IF NOT EXISTS _salve_schema_versions (
    name    TEXT PRIMARY KEY,
    version INTEGER NOT NULL
  );
)sql";

int MigrationEngine::storedVersion(const std::string& schemaName) {
  auto result = _conn->execute(
    "SELECT version FROM _salve_schema_versions WHERE name = ?",
    { schemaName }
  );
  if (result.rows.empty()) return 0;
  return static_cast<int>(std::get<double>(result.rows[0][0]));
}

void MigrationEngine::setStoredVersion(const std::string& schemaName, int version) {
  _conn->execute(
    "INSERT OR REPLACE INTO _salve_schema_versions (name, version) VALUES (?, ?)",
    { schemaName, static_cast<double>(version) }
  );
}

// ── Column type mapping ───────────────────────────────────────────────────────

std::string MigrationEngine::sqliteType(const std::string& colType) const {
  if (colType == "text")     return "TEXT";
  if (colType == "integer")  return "INTEGER";
  if (colType == "real")     return "REAL";
  if (colType == "boolean")  return "INTEGER"; // stored as 0/1
  if (colType == "datetime") return "INTEGER"; // stored as epoch millis
  if (colType == "blob")     return "BLOB";
  return "TEXT";
}

// ── Existing columns ──────────────────────────────────────────────────────────

std::vector<std::string> MigrationEngine::existingColumns(const std::string& tableName) {
  auto result = _conn->execute("PRAGMA table_info(\"" + tableName + "\")", {});
  std::vector<std::string> cols;
  for (auto& row : result.rows) {
    // PRAGMA table_info columns: cid, name, type, notnull, dflt_value, pk
    if (row.size() > 1 && std::holds_alternative<std::string>(row[1])) {
      cols.push_back(std::get<std::string>(row[1]));
    }
  }
  return cols;
}

// ── CREATE TABLE ──────────────────────────────────────────────────────────────

void MigrationEngine::createTable(const SchemaDef& schema) {
  std::ostringstream ddl;
  ddl << "CREATE TABLE IF NOT EXISTS \"" << schema.name << "\" (\n";

  bool first = true;
  for (auto& [colName, col] : schema.columns) {
    if (!first) ddl << ",\n";
    first = false;
    ddl << "  \"" << colName << "\" " << sqliteType(col.type);
    if (!col.nullable) ddl << " NOT NULL";
    if (col.unique)    ddl << " UNIQUE";
    if (colName == schema.primaryKey) ddl << " PRIMARY KEY";
  }

  ddl << "\n);";
  _conn->exec(ddl.str());

  // Indexes
  for (auto& idx : schema.indexes) {
    std::ostringstream idxDdl;
    idxDdl << "CREATE " << (idx.unique ? "UNIQUE " : "") << "INDEX IF NOT EXISTS \""
           << idx.name << "\" ON \"" << schema.name << "\" (";
    for (size_t i = 0; i < idx.columns.size(); ++i) {
      if (i) idxDdl << ", ";
      idxDdl << "\"" << idx.columns[i] << "\"";
    }
    idxDdl << ");";
    _conn->exec(idxDdl.str());
  }
}

// ── ALTER TABLE ADD COLUMN (migration) ───────────────────────────────────────

void MigrationEngine::migrateTable(const SchemaDef& schema) {
  auto existing = existingColumns(schema.name);

  for (auto& [colName, col] : schema.columns) {
    bool found = std::find(existing.begin(), existing.end(), colName) != existing.end();
    if (!found) {
      // ADD COLUMN — nullable or has default (SQLite restriction)
      std::ostringstream alter;
      alter << "ALTER TABLE \"" << schema.name << "\" ADD COLUMN \""
            << colName << "\" " << sqliteType(col.type);
      // New NOT NULL columns require a DEFAULT in SQLite; pick a type-safe literal
      if (!col.nullable && !col.hasDef) {
        const std::string& t = col.type;
        if (t == "integer" || t == "boolean" || t == "datetime" || t == "real")
          alter << " DEFAULT 0";
        else if (t == "blob")
          alter << " DEFAULT (X'')";
        else
          alter << " DEFAULT ''";
      }
      _conn->exec(alter.str());
    }
  }
}

// ── Public: registerSchema ────────────────────────────────────────────────────

void MigrationEngine::registerSchema(const SchemaDef& schema) {
  TransactionGuard txn(*_conn);

  // Ensure version tracking table exists
  _conn->exec(kVersionTable);

  int stored = storedVersion(schema.name);

  if (stored == 0) {
    createTable(schema);
  } else if (schema.version > stored) {
    migrateTable(schema);
  }
  // If schema.version == stored, nothing to do (idempotent)

  if (schema.version != stored) {
    setStoredVersion(schema.name, schema.version);
  }

  txn.commit();
}

// ── JSON parsing ──────────────────────────────────────────────────────────────

SchemaDef MigrationEngine::parseSchemaJson(const std::string& jsonStr) {
  auto root = json::parse(jsonStr);
  if (!root.isObject())
    throw std::runtime_error("registerSchema: JSON must be an object");

  SchemaDef schema;
  schema.name       = root.getString("name");
  schema.version    = static_cast<int>(root.getNumber("version", 1));
  schema.primaryKey = root.getString("primaryKey");

  if (schema.name.empty())
    throw std::runtime_error("registerSchema: 'name' is required");
  if (schema.primaryKey.empty())
    throw std::runtime_error("registerSchema: 'primaryKey' is required");

  auto columnsVal = root.get("columns");
  if (columnsVal && columnsVal->get().isObject()) {
    for (auto& [colName, colVal] : columnsVal->get().asObject()) {
      ColumnDef col;
      col.type     = colVal.getString("type", "text");
      col.nullable = colVal.getBool("nullable", true);
      col.unique   = colVal.getBool("unique", false);
      col.hasDef   = colVal.has("default");
      schema.columns[colName] = col;
    }
  }

  auto indexesVal = root.get("indexes");
  if (indexesVal && indexesVal->get().isArray()) {
    for (auto& idxVal : indexesVal->get().asArray()) {
      if (!idxVal.isObject()) continue;
      IndexDef idx;
      idx.name   = idxVal.getString("name");
      idx.unique = idxVal.getBool("unique", false);
      auto colsVal = idxVal.get("columns");
      if (colsVal && colsVal->get().isArray()) {
        for (auto& c : colsVal->get().asArray()) {
          if (c.isString()) idx.columns.push_back(c.asString());
        }
      }
      if (!idx.name.empty() && !idx.columns.empty()) {
        schema.indexes.push_back(std::move(idx));
      }
    }
  }

  return schema;
}

} // namespace margelo::nitro::salvedb
