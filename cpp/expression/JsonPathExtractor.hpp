#pragma once

#include "../database/json_parser.hpp"
#include <optional>
#include <string>

namespace margelo::nitro::salvedb {

// Plain C++ collaborator (not a HybridObject) — extracts a value from a
// response json::Value via the MVP JsonPath subset ($.a.b, dot-separated
// keys only, no array indexing/wildcards).
class JsonPathExtractor {
public:
  // std::nullopt means the path is absent; an engaged optional holding a
  // JSON null Value means the path resolved to a literal null.
  static std::optional<json::Value> extract(const json::Value& root, const std::string& path);
};

} // namespace margelo::nitro::salvedb
