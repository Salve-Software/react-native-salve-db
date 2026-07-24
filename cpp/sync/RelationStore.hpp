#pragma once

#include "../database/SQLiteConnection.hpp"
#include <memory>
#include <string>
#include <vector>

namespace margelo::nitro::salvedb {

struct RelationDef {
  std::string column;
  std::string references;
};

struct RelationRow {
  std::string childTable;
  std::string fkColumn;
  std::string parentTable;
};

// Plain C++ collaborator (not a HybridObject) — persists each schema's FK
// relations in `_salve_relations`, so it survives a restart without depending
// on JS having run register() in the current process.
class RelationStore {
public:
  explicit RelationStore(std::shared_ptr<SQLiteConnection> conn);

  void replaceForChild(const std::string& childTable, const std::vector<RelationDef>& relations);
  std::vector<RelationRow> getRelationsReferencing(const std::string& parentTable);

private:
  std::shared_ptr<SQLiteConnection> _conn;
};

} // namespace margelo::nitro::salvedb
