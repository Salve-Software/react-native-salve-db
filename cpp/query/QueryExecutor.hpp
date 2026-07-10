#pragma once

#include "QueryResult.hpp"
#include "../database/SQLiteConnection.hpp"
#include <string>
#include <vector>

namespace margelo::nitro::salvedb {

// Plain C++ collaborator (not a HybridObject) — owned and forwarded to by
// HybridSalveDatabase, which is the single Nitro-facing orchestrator.
class QueryExecutor {
public:
  QueryResult execute(const std::string& sql, const std::vector<SqlValue>& params);
  void beginTransaction();
  void commit();
  void rollback();
};

} // namespace margelo::nitro::salvedb
