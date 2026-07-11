#pragma once

#include <mutex>
#include <string>
#include <unordered_map>
#include <unordered_set>

namespace margelo::nitro::salvedb {

// Tracks which registered columns are declared as `boolean` in the TS schema,
// so SQLiteConnection::execute can coerce SQLite's 0/1 INTEGER storage back
// to a JS bool on read — SQLite itself has no native boolean column type.
class SchemaRegistry {
public:
  static SchemaRegistry& shared() {
    static SchemaRegistry instance;
    return instance;
  }

  void registerBooleanColumns(const std::string& table, std::unordered_set<std::string> columns);
  bool isBoolean(const std::string& table, const std::string& column) const;

private:
  SchemaRegistry() = default;

  mutable std::mutex _mutex;
  std::unordered_map<std::string, std::unordered_set<std::string>> _booleanColumns;
};

} // namespace margelo::nitro::salvedb
