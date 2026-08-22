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
  // `renderedQuery` is appended verbatim after `?` — the caller (UrlTemplate::render)
  // has already percent-encoded whatever needed it; this does not re-encode.
  static std::string build(const std::string& baseUrl, const std::string& path, const std::string& renderedQuery);
  static std::string encodeSegment(const std::string& segment);
};

} // namespace margelo::nitro::salvedb
