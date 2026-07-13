#pragma once

#include <string>

namespace margelo::nitro::salvedb {

class HttpUrlBuilder {
public:
  static std::string build(const std::string& baseUrl, const std::string& path);
};

} // namespace margelo::nitro::salvedb
