#include "HttpUrlBuilder.hpp"

namespace margelo::nitro::salvedb {

std::string HttpUrlBuilder::build(const std::string& baseUrl, const std::string& path) {
  std::string base = baseUrl;
  if (!base.empty() && base.back() == '/') {
    base.pop_back();
  }

  if (path.empty()) {
    return base;
  }

  if (path.front() == '/') {
    return base + path;
  }
  return base + "/" + path;
}

} // namespace margelo::nitro::salvedb
