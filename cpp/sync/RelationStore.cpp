#include "RelationStore.hpp"

namespace margelo::nitro::salvedb {

RelationStore::RelationStore(std::shared_ptr<SQLiteConnection> conn)
  : _conn(std::move(conn)) {}

void RelationStore::replaceForChild(const std::string& childTable, const std::vector<RelationDef>& relations) {
  _conn->execute("DELETE FROM _salve_relations WHERE childTable = ?", { childTable });
  for (auto& rel : relations) {
    _conn->execute(
      "INSERT INTO _salve_relations (childTable, fkColumn, parentTable) VALUES (?, ?, ?)",
      { childTable, rel.column, rel.references }
    );
  }
}

std::vector<RelationRow> RelationStore::getRelationsReferencing(const std::string& parentTable) {
  auto result = _conn->execute(
    "SELECT childTable, fkColumn, parentTable FROM _salve_relations WHERE parentTable = ?",
    { parentTable }
  );

  std::vector<RelationRow> rows;
  rows.reserve(result.rows.size());
  for (auto& row : result.rows) {
    rows.push_back(RelationRow{
      std::get<std::string>(row[0]),
      std::get<std::string>(row[1]),
      std::get<std::string>(row[2])
    });
  }
  return rows;
}

} // namespace margelo::nitro::salvedb
