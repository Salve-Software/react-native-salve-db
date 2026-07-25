#pragma once

#include <string>

namespace margelo::nitro::salvedb {

/**
 * Joins a configured base URL with an endpoint path, normalizing the single
 * slash between them regardless of trailing/leading slashes on either side.
 */
class HttpUrlBuilder {
public:
  static std::string build(const std::string& baseUrl, const std::string& path);
};

} // namespace margelo::nitro::salvedb
