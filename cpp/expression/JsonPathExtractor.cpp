#include "JsonPathExtractor.hpp"
#include <stdexcept>
#include <vector>

namespace margelo::nitro::salvedb {

namespace {

std::vector<std::string> splitSegments(const std::string& rest) {
  std::vector<std::string> segments;
  size_t start = 0;
  while (start < rest.size()) {
    size_t dot = rest.find('.', start);
    size_t end = (dot == std::string::npos) ? rest.size() : dot;
    if (end == start) {
      throw std::runtime_error("ExpressionInterpreter: malformed JsonPath \"" + rest + "\"");
    }
    segments.push_back(rest.substr(start, end - start));
    start = (dot == std::string::npos) ? rest.size() : dot + 1;
  }
  if (!rest.empty() && rest.back() == '.') {
    throw std::runtime_error("ExpressionInterpreter: malformed JsonPath, trailing \".\"");
  }
  return segments;
}

} // namespace

std::optional<json::Value> JsonPathExtractor::extract(const json::Value& root, const std::string& path) {
  if (path.empty() || path[0] != '$') {
    throw std::runtime_error("ExpressionInterpreter: JsonPath must start with \"$\", got \"" + path + "\"");
  }

  std::string rest = path.substr(1);
  if (rest.empty()) {
    return root;
  }
  if (rest[0] != '.') {
    throw std::runtime_error("ExpressionInterpreter: malformed JsonPath \"" + path + "\"");
  }

  auto segments = splitSegments(rest.substr(1));

  const json::Value* current = &root;
  for (const auto& segment : segments) {
    auto next = current->get(segment);
    if (!next) {
      return std::nullopt;
    }
    current = &next->get();
  }
  return *current;
}

} // namespace margelo::nitro::salvedb
