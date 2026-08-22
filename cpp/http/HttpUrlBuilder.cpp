#include "HttpUrlBuilder.hpp"

namespace margelo::nitro::salvedb {

namespace {

bool isUnreserved(char c) {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
         c == '-' || c == '_' || c == '.' || c == '~';
}

} // namespace

std::string HttpUrlBuilder::build(const std::string& baseUrl, const std::string& path) {
  std::string base = baseUrl;
  while (!base.empty() && base.back() == '/') {
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

std::string HttpUrlBuilder::build(const std::string& baseUrl, const std::string& path, const std::string& renderedQuery) {
  std::string url = build(baseUrl, path);
  // A schema author writing "?updatedAfter={since}..." (a natural reading of
  // "template for the query string") must not produce a literal "??" — this
  // is the one place that owns the '?', so normalize a leading one here
  // rather than rejecting it at template-parse time (where '?' is otherwise
  // legal literal text, e.g. mid-template in an already-encoded value).
  size_t start = renderedQuery.find_first_not_of('?');
  if (start == std::string::npos) return url;
  return url + "?" + renderedQuery.substr(start);
}

std::string HttpUrlBuilder::encodeSegment(const std::string& segment) {
  static constexpr char kHex[] = "0123456789ABCDEF";
  std::string result;
  result.reserve(segment.size());
  for (unsigned char c : segment) {
    if (isUnreserved(static_cast<char>(c))) {
      result += static_cast<char>(c);
    } else {
      result += '%';
      result += kHex[(c >> 4) & 0xF];
      result += kHex[c & 0xF];
    }
  }
  return result;
}

} // namespace margelo::nitro::salvedb
