#pragma once

#include <algorithm>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace margelo::nitro::salvedb {

/**
 * String-keyed map that preserves insertion order — how every real SQL engine
 * (Postgres, MySQL, SQLite) keeps column/key declaration order. `std::map`
 * silently re-sorts keys alphabetically instead, which is wrong here: JSON
 * object keys and schema column order are meaningful (physical column layout,
 * `json_object()` payload shape), not just a lookup structure.
 *
 * Backed by a flat vector and linear-scanned by key. That's the right
 * tradeoff for what this holds — JSON objects and table schemas, a handful of
 * entries at most, never a hot-path lookup structure.
 */
template <typename V>
class OrderedMap {
public:
  using Entry = std::pair<std::string, V>;
  using iterator = typename std::vector<Entry>::iterator;
  using const_iterator = typename std::vector<Entry>::const_iterator;

  V& operator[](const std::string& key) {
    auto it = find(key);
    if (it != end()) return it->second;
    _entries.emplace_back(key, V{});
    return _entries.back().second;
  }

  const V& at(const std::string& key) const {
    auto it = find(key);
    if (it == end()) throw std::out_of_range("OrderedMap::at: key not found: " + key);
    return it->second;
  }

  iterator find(const std::string& key) {
    return std::find_if(_entries.begin(), _entries.end(), [&](const Entry& e) { return e.first == key; });
  }
  const_iterator find(const std::string& key) const {
    return std::find_if(_entries.begin(), _entries.end(), [&](const Entry& e) { return e.first == key; });
  }

  size_t count(const std::string& key) const { return find(key) != end() ? 1 : 0; }

  iterator begin() { return _entries.begin(); }
  iterator end() { return _entries.end(); }
  const_iterator begin() const { return _entries.begin(); }
  const_iterator end() const { return _entries.end(); }

  size_t size() const { return _entries.size(); }
  bool empty() const { return _entries.empty(); }

private:
  std::vector<Entry> _entries;
};

} // namespace margelo::nitro::salvedb
