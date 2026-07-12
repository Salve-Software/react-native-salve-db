#pragma once

#include <string>
#include <utility>
#include <variant>
#include <vector>

namespace margelo::nitro::salvedb {

enum class HttpMethod { Get, Post, Put, Patch, Delete };

// Ordered, allows duplicate keys — matches how HTTP headers behave on the wire.
using HttpHeaders = std::vector<std::pair<std::string, std::string>>;

struct HttpRequest {
  HttpMethod method;
  std::string url;      // already resolved by HttpUrlBuilder
  HttpHeaders headers;
  std::string body;     // pre-serialized JSON, empty if none
  double timeoutMs;
};

// Any completed exchange, including 4xx/5xx — status interpretation is the caller's job.
struct HttpResponse {
  int status;
  std::string body;
  HttpHeaders headers;
};

enum class HttpNetworkErrorKind { Timeout, NoConnection, Cancelled, Other };

// Transport-level failure — no response was received.
struct HttpNetworkError {
  HttpNetworkErrorKind kind;
  std::string message;
};

using HttpOutcome = std::variant<HttpResponse, HttpNetworkError>;

} // namespace margelo::nitro::salvedb
