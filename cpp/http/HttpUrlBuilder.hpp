#pragma once

#include <string>
#include <utility>
#include <vector>

namespace margelo::nitro::salvedb {

class HttpUrlBuilder {
public:
  using QueryParams = std::vector<std::pair<std::string, std::string>>;

  static std::string build(const std::string& baseUrl, const std::string& path);
  static std::string build(const std::string& baseUrl, const std::string& path, const QueryParams& query);
  static std::string encodeSegment(const std::string& segment);
};

} // namespace margelo::nitro::salvedb
