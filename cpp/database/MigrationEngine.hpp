#pragma once

#include "SQLiteConnection.hpp"
#include "json_parser.hpp"
#include "../sync/RelationStore.hpp"
#include <memory>
#include <string>
#include <map>
#include <vector>
#include <optional>

namespace margelo::nitro::salvedb {

struct ColumnDef {
  std::string type;
  bool nullable = true;
  bool unique   = false;
  bool hasDef   = false;
  // SQL-ready literal for `default` (e.g. "'x'", "42", "1"), set iff hasDef.
  std::optional<std::string> defaultLiteral;
};

struct IndexDef {
  std::string name;
  std::vector<std::string> columns;
  bool unique = false;
};

struct SyncSettings {
  bool enabled = false;
  json::Value definition; // full `sync` JSON object, unparsed
};

struct SchemaDef {
  std::string name;
  int version = 1;
  std::string primaryKey;
  std::map<std::string, ColumnDef> columns;
  std::vector<IndexDef> indexes;
  std::vector<RelationDef> relations;
  SyncSettings sync;
};

class MigrationEngine {
public:
  explicit MigrationEngine(std::shared_ptr<SQLiteConnection> conn);

  // Idempotent: creates table if absent, adds missing columns, bumps version.
  void registerSchema(const SchemaDef& schema);

  static SchemaDef parseSchemaJson(const std::string& json);

private:
  std::shared_ptr<SQLiteConnection> _db;

  void createTable(const SchemaDef& schema);
  bool migrateTable(const SchemaDef& schema); // true if a column was added

  int storedVersion(const std::string& schemaName);
  void setStoredVersion(const std::string& schemaName, int version);

  std::string sqliteType(const std::string& colType) const;
  std::vector<std::string> existingColumns(const std::string& tableName);

  void createSyncTriggers(const SchemaDef& schema);
  void dropSyncTriggers(const SchemaDef& schema);

  void createRelationIndexes(const SchemaDef& schema);
};

} // namespace margelo::nitro::salvedb
