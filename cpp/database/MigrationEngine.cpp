#include "MigrationEngine.hpp"
#include "json_parser.hpp"
#include "SchemaRegistry.hpp"
#include "../sync/SyncDefinitionStore.hpp"

#include <sstream>
#include <algorithm>
#include <stdexcept>
#include <unordered_set>

namespace margelo::nitro::salvedb {

MigrationEngine::MigrationEngine(std::shared_ptr<SQLiteConnection> conn)
  : _db(std::move(conn)) {}

namespace {

// Rolls back on scope exit unless commit() ran, so a mid-sequence throw can't leave a half-applied migration.
class TransactionGuard {
public:
  explicit TransactionGuard(SQLiteConnection& conn) : _db(conn) {
    _db.beginTransaction();
  }

  TransactionGuard(const TransactionGuard&) = delete;
  TransactionGuard& operator=(const TransactionGuard&) = delete;

  ~TransactionGuard() {
    if (!_committed) {
      try {
        _db.rollback();
      } catch (...) {
        // destructors must not throw
      }
    }
  }

  void commit() {
    _db.commit();
    _committed = true;
  }

private:
  SQLiteConnection& _db;
  bool _committed = false;
};

std::string formatDefaultLiteral(const json::Value& v) {
  if (v.isString()) {
    std::string escaped;
    for (char c : v.asString()) {
      if (c == '\'') escaped += "''";
      else escaped += c;
    }
    return "'" + escaped + "'";
  }
  if (v.isBool()) return v.asBool() ? "1" : "0";
  if (v.isNumber()) {
    double d = v.asNumber();
    if (d == static_cast<double>(static_cast<long long>(d))) {
      return std::to_string(static_cast<long long>(d));
    }
    std::ostringstream oss;
    oss.precision(17);
    oss << d;
    return oss.str();
  }
  return "NULL";
}

} // namespace

// ── Schema version table ─────────────────────────────────────────────────────

static constexpr auto kVersionTable = R"sql(
  CREATE TABLE IF NOT EXISTS _salve_schema_versions (
    name    TEXT PRIMARY KEY,
    version INTEGER NOT NULL
  );
)sql";

// ── Sync queue / apply lock (global, created once regardless of schema) ──────

static constexpr auto kSyncQueueTable = R"sql(
  CREATE TABLE IF NOT EXISTS sync_queue (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    operation  TEXT    NOT NULL,
    entity     TEXT    NOT NULL,
    entity_id  TEXT    NOT NULL,
    payload    TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
  );
)sql";

static constexpr auto kSyncApplyLockTable = R"sql(
  CREATE TABLE IF NOT EXISTS _sync_apply_lock (
    id INTEGER PRIMARY KEY CHECK (id = 1)
  );
)sql";

static constexpr auto kSyncCursorTable = R"sql(
  CREATE TABLE IF NOT EXISTS _salve_sync_cursors (
    entity TEXT PRIMARY KEY,
    cursor TEXT NOT NULL
  );
)sql";

static constexpr auto kSyncDefinitionTable = R"sql(
  CREATE TABLE IF NOT EXISTS _salve_sync_definitions (
    name       TEXT PRIMARY KEY,
    definition TEXT NOT NULL
  );
)sql";

int MigrationEngine::storedVersion(const std::string& schemaName) {
  auto result = _db->execute(
    "SELECT version FROM _salve_schema_versions WHERE name = ?",
    { schemaName }
  );
  if (result.rows.empty()) return 0;
  return static_cast<int>(std::get<double>(result.rows[0][0]));
}

void MigrationEngine::setStoredVersion(const std::string& schemaName, int version) {
  _db->execute(
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
  auto result = _db->execute("PRAGMA table_info(\"" + tableName + "\")", {});
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
    if (col.defaultLiteral) ddl << " DEFAULT " << *col.defaultLiteral;
    if (colName == schema.primaryKey) ddl << " PRIMARY KEY";
  }

  ddl << "\n);";
  _db->exec(ddl.str());

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
    _db->exec(idxDdl.str());
  }
}

// ── ALTER TABLE ADD COLUMN (migration) ───────────────────────────────────────

bool MigrationEngine::migrateTable(const SchemaDef& schema) {
  auto existing = existingColumns(schema.name);
  bool added = false;

  for (auto& [colName, col] : schema.columns) {
    bool found = std::find(existing.begin(), existing.end(), colName) != existing.end();
    if (!found) {
      added = true;
      std::ostringstream alter;
      alter << "ALTER TABLE \"" << schema.name << "\" ADD COLUMN \""
            << colName << "\" " << sqliteType(col.type);
      if (col.defaultLiteral) {
        alter << " DEFAULT " << *col.defaultLiteral;
      } else if (!col.nullable) {
        // No declared default, but NOT NULL needs one to backfill existing rows.
        const std::string& t = col.type;
        if (t == "integer" || t == "boolean" || t == "datetime" || t == "real")
          alter << " DEFAULT 0";
        else if (t == "blob")
          alter << " DEFAULT (X'')";
        else
          alter << " DEFAULT ''";
      }
      _db->exec(alter.str());

      // ALTER TABLE ADD COLUMN can't carry a UNIQUE constraint directly.
      if (col.unique) {
        _db->exec("CREATE UNIQUE INDEX IF NOT EXISTS \"" + schema.name + "_" + colName +
                    "_unique\" ON \"" + schema.name + "\" (\"" + colName + "\")");
      }
    }
  }

  return added;
}

// ── Sync triggers ──────────────────────────────────────────────────────────

namespace {

std::string buildJsonObjectArgs(const SchemaDef& schema, const std::string& rowAlias) {
  std::ostringstream args;
  bool first = true;
  for (auto& [colName, col] : schema.columns) {
    if (!first) args << ", ";
    first = false;
    args << "'" << colName << "', " << rowAlias << ".\"" << colName << "\"";
  }
  return args.str();
}

} // namespace

void MigrationEngine::createSyncTriggers(const SchemaDef& schema) {
  const std::string& t  = schema.name;
  const std::string& pk = schema.primaryKey;
  std::string rowCols = buildJsonObjectArgs(schema, "NEW");

  std::ostringstream insertTrig;
  insertTrig << "CREATE TRIGGER IF NOT EXISTS \"" << t << "_sync_after_insert\"\n"
             << "AFTER INSERT ON \"" << t << "\"\n"
             << "WHEN NOT EXISTS (SELECT 1 FROM _sync_apply_lock)\n"
             << "BEGIN\n"
             << "  INSERT INTO sync_queue (operation, entity, entity_id, payload, updated_at)\n"
             << "  VALUES ('insert', '" << t << "', NEW.\"" << pk << "\",\n"
             << "    json_object(" << rowCols << "),\n"
             << "    CAST(strftime('%s','now') * 1000 AS INTEGER));\n"
             << "END;";
  _db->exec(insertTrig.str());

  std::ostringstream updateTrig;
  updateTrig << "CREATE TRIGGER IF NOT EXISTS \"" << t << "_sync_after_update\"\n"
             << "AFTER UPDATE ON \"" << t << "\"\n"
             << "WHEN NOT EXISTS (SELECT 1 FROM _sync_apply_lock)\n"
             << "BEGIN\n"
             << "  INSERT INTO sync_queue (operation, entity, entity_id, payload, updated_at)\n"
             << "  VALUES ('update', '" << t << "', NEW.\"" << pk << "\",\n"
             << "    json_object(" << rowCols << "),\n"
             << "    CAST(strftime('%s','now') * 1000 AS INTEGER));\n"
             << "END;";
  _db->exec(updateTrig.str());

  // PK-only payload: the row is already gone by the time AFTER DELETE fires.
  std::ostringstream deleteTrig;
  deleteTrig << "CREATE TRIGGER IF NOT EXISTS \"" << t << "_sync_after_delete\"\n"
             << "AFTER DELETE ON \"" << t << "\"\n"
             << "WHEN NOT EXISTS (SELECT 1 FROM _sync_apply_lock)\n"
             << "BEGIN\n"
             << "  INSERT INTO sync_queue (operation, entity, entity_id, payload, updated_at)\n"
             << "  VALUES ('delete', '" << t << "', OLD.\"" << pk << "\",\n"
             << "    json_object('" << pk << "', OLD.\"" << pk << "\"),\n"
             << "    CAST(strftime('%s','now') * 1000 AS INTEGER));\n"
             << "END;";
  _db->exec(deleteTrig.str());
}

void MigrationEngine::dropSyncTriggers(const SchemaDef& schema) {
  const std::string& t = schema.name;
  _db->exec("DROP TRIGGER IF EXISTS \"" + t + "_sync_after_insert\";");
  _db->exec("DROP TRIGGER IF EXISTS \"" + t + "_sync_after_update\";");
  _db->exec("DROP TRIGGER IF EXISTS \"" + t + "_sync_after_delete\";");
}

// ── Public: registerSchema ────────────────────────────────────────────────────

void MigrationEngine::registerSchema(const SchemaDef& schema) {
  TransactionGuard txn(*_db);

  // Ensure version tracking / sync queue tables exist
  _db->exec(kVersionTable);
  _db->exec(kSyncQueueTable);
  _db->exec(kSyncApplyLockTable);
  _db->exec(kSyncCursorTable);
  _db->exec(kSyncDefinitionTable);

  int stored = storedVersion(schema.name);
  bool columnsChanged = false;

  if (stored == 0) {
    createTable(schema);
    columnsChanged = true;
  } else if (schema.version > stored) {
    columnsChanged = migrateTable(schema);
  }
  // If schema.version == stored, nothing to do (idempotent)

  if (schema.sync.enabled) {
    // Triggers are CREATE ... IF NOT EXISTS, so a stale json_object(...) needs an explicit drop+recreate.
    if (columnsChanged) {
      dropSyncTriggers(schema);
      createSyncTriggers(schema);
    }
  } else {
    dropSyncTriggers(schema); // no-op unless sync was previously enabled
  }

  if (schema.version != stored) {
    setStoredVersion(schema.name, schema.version);
  }

  SyncDefinitionStore defStore(_db);
  if (schema.sync.enabled) {
    defStore.save(schema.name, schema.sync.definition);
  } else {
    defStore.remove(schema.name);
  }

  txn.commit();

  std::unordered_set<std::string> booleanColumns;
  for (auto& [colName, col] : schema.columns) {
    if (col.type == "boolean") booleanColumns.insert(colName);
  }
  SchemaRegistry::shared().registerBooleanColumns(schema.name, std::move(booleanColumns));
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
      if (col.hasDef) {
        col.defaultLiteral = formatDefaultLiteral(colVal.get("default")->get());
      }
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

  auto syncVal = root.get("sync");
  if (syncVal && syncVal->get().isObject()) {
    const json::Value& syncObj = syncVal->get();
    schema.sync.enabled    = syncObj.getBool("enabled", false);
    schema.sync.definition = syncObj;

    if (schema.sync.enabled) {
      auto updatedAt = schema.columns.find("updatedAt");
      if (updatedAt == schema.columns.end() || updatedAt->second.type != "datetime") {
        throw std::runtime_error(
          "registerSchema: sync.enabled requires a 'datetime' column named 'updatedAt' (used for lastWriteWins)"
        );
      }
    }
  }

  return schema;
}

} // namespace margelo::nitro::salvedb
