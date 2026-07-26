#include "RelationCascadeRewriter.hpp"
#include "RelationStore.hpp"

namespace margelo::nitro::salvedb {

RelationCascadeRewriter::RelationCascadeRewriter(std::shared_ptr<SQLiteConnection> conn)
  : _conn(std::move(conn)) {}

void RelationCascadeRewriter::rewrite(const std::string& parentTable, const std::string& oldId, const std::string& newId) {
  auto relations = RelationStore(_conn).getRelationsReferencing(parentTable);
  for (auto& rel : relations) {
    _conn->execute(
      "UPDATE \"" + rel.childTable + "\" SET \"" + rel.fkColumn + "\" = ? WHERE \"" + rel.fkColumn + "\" = ?",
      { newId, oldId }
    );
  }
}

} // namespace margelo::nitro::salvedb
