#pragma once

#include "../database/SQLiteConnection.hpp"
#include <memory>
#include <string>

namespace margelo::nitro::salvedb {

// Rewrites child FK columns when a parent row's id changes from a temporary
// to a server-assigned value. Multi-level cascade (grandparent -> parent ->
// child) is an emergent property of multiple rewrite() calls across
// successive sync events, not a recursive graph walk — an entity's id only
// changes when that entity itself syncs. Must run inside the caller's
// SyncApplyGuard::applyWithBypass; opens no transaction of its own.
class RelationCascadeRewriter {
public:
  explicit RelationCascadeRewriter(std::shared_ptr<SQLiteConnection> conn);

  void rewrite(const std::string& parentTable, const std::string& oldId, const std::string& newId);

private:
  std::shared_ptr<SQLiteConnection> _conn;
};

} // namespace margelo::nitro::salvedb
