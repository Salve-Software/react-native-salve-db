#pragma once

#include "SQLiteConnection.hpp"
#include "json_parser.hpp"
#include <memory>
#include <string>
#include <map>
#include <vector>

namespace margelo::nitro::salvedb {

struct ColumnDef {
  std::string type;
  bool nullable = true;
  bool unique   = false;
  bool hasDef   = false;
};

struct IndexDef {
  std::string name;
  std::vector<std::string> columns;
  bool unique = false;
};

struct SchemaDef {
  std::string name;
  int version = 1;
  std::string primaryKey;
  std::map<std::string, ColumnDef> columns;
  std::vector<IndexDef> indexes;
};

class MigrationEngine {
public:
  explicit MigrationEngine(std::shared_ptr<SQLiteConnection> conn);

  // Idempotent: creates table if absent, adds missing columns, bumps version.
  void registerSchema(const SchemaDef& schema);

  static SchemaDef parseSchemaJson(const std::string& json);

private:
  std::shared_ptr<SQLiteConnection> _conn;

  void createTable(const SchemaDef& schema);
  void migrateTable(const SchemaDef& schema);

  int storedVersion(const std::string& schemaName);
  void setStoredVersion(const std::string& schemaName, int version);

  std::string sqliteType(const std::string& colType) const;
  std::vector<std::string> existingColumns(const std::string& tableName);
};

} // namespace margelo::nitro::salvedb
