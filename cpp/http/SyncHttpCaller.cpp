#include "SyncHttpCaller.hpp"
#include "HttpUrlBuilder.hpp"
#include "../platform/platform.hpp"
#include <cctype>
#include <stdexcept>

namespace margelo::nitro::salvedb {

namespace {

HttpMethod methodFromString(const std::string& method) {
  if (method == "GET")    return HttpMethod::Get;
  if (method == "POST")   return HttpMethod::Post;
  if (method == "PUT")    return HttpMethod::Put;
  if (method == "PATCH")  return HttpMethod::Patch;
  if (method == "DELETE") return HttpMethod::Delete;
  throw std::runtime_error("SyncHttpCaller: unknown endpoint.method '" + method + "'");
}

bool isBlank(const std::string& s) {
  for (char c : s) if (!std::isspace(static_cast<unsigned char>(c))) return false;
  return true;
}

HttpHeaders buildHeaders(const SyncEndpoint& endpoint, const AuthHeader& authHeader, bool withContentType) {
  HttpHeaders headers;
  if (withContentType) headers.emplace_back("Content-Type", "application/json");
  headers.push_back(authHeader);
  for (auto& h : endpoint.extraHeaders) headers.push_back(h);
  return headers;
}

// 204/empty bodies short-circuit to a null body instead of failing json::parse("").
SyncHttpOutcome performRequest(HttpRequest request) {
  HttpOutcome outcome = platform::httpExecute(request);
  if (auto* error = std::get_if<HttpNetworkError>(&outcome)) return *error;

  const auto& response = std::get<HttpResponse>(outcome);
  if (response.statusCode == 204 || isBlank(response.body)) {
    return SyncHttpResponse{response.statusCode, json::Value(nullptr)};
  }

  // An unparseable body — 2xx or not — is treated as a null confirmation
  // rather than a hard failure. Callers already handle a null body correctly
  // (applyReplace's empty-response branch, SyncPullPhase's array check), so
  // this surfaces as a clear, expected error at the right layer instead of
  // an opaque parse exception escaping mid-loop.
  try {
    return SyncHttpResponse{response.statusCode, json::parse(response.body)};
  } catch (const std::exception&) {
    return SyncHttpResponse{response.statusCode, json::Value(nullptr)};
  }
}

} // namespace

SyncHttpOutcome SyncHttpCaller::list(const SyncEndpoint& endpoint, int64_t sinceMs, int limit,
                                      const AuthHeader& authHeader, const NetworkConfig& network) {
  std::string query = endpoint.listQueryTemplate.render({
    {"since", std::to_string(sinceMs)},
    {"limit", std::to_string(limit)},
    {"cursorField", endpoint.cursorField}
  });
  HttpRequest request{
    HttpMethod::Get,
    HttpUrlBuilder::build(network.baseUrl, endpoint.basePath, query),
    buildHeaders(endpoint, authHeader, false),
    std::nullopt,
    network.timeoutMs
  };
  return performRequest(std::move(request));
}

SyncHttpOutcome SyncHttpCaller::create(const SyncEndpoint& endpoint, const json::Value& entity,
                                        const AuthHeader& authHeader, const NetworkConfig& network) {
  HttpRequest request{
    HttpMethod::Post,
    HttpUrlBuilder::build(network.baseUrl, endpoint.basePath),
    buildHeaders(endpoint, authHeader, true),
    json::stringify(entity),
    network.timeoutMs
  };
  return performRequest(std::move(request));
}

SyncHttpOutcome SyncHttpCaller::update(const SyncEndpoint& endpoint, const std::string& id, const json::Value& entity,
                                        const AuthHeader& authHeader, const NetworkConfig& network) {
  std::string path = endpoint.itemPathTemplate.render({{"basePath", endpoint.basePath}, {"id", id}});
  HttpRequest request{
    HttpMethod::Patch,
    HttpUrlBuilder::build(network.baseUrl, path),
    buildHeaders(endpoint, authHeader, true),
    json::stringify(entity),
    network.timeoutMs
  };
  return performRequest(std::move(request));
}

SyncHttpOutcome SyncHttpCaller::remove(const SyncEndpoint& endpoint, const std::string& id,
                                        const AuthHeader& authHeader, const NetworkConfig& network) {
  std::string path = endpoint.itemPathTemplate.render({{"basePath", endpoint.basePath}, {"id", id}});
  HttpRequest request{
    HttpMethod::Delete,
    HttpUrlBuilder::build(network.baseUrl, path),
    buildHeaders(endpoint, authHeader, false),
    std::nullopt,
    network.timeoutMs
  };
  return performRequest(std::move(request));
}

SyncHttpOutcome SyncHttpCaller::send(
  const json::Value& endpoint,
  const json::Value& body,
  const std::pair<std::string, std::string>& authHeader,
  const NetworkConfig& network
) {
  std::string path = endpoint.getString("path");
  if (path.empty()) {
    throw std::runtime_error("SyncHttpCaller: endpoint.path is required");
  }

  HttpHeaders headers{
    {"Content-Type", "application/json"},
    {authHeader.first, authHeader.second}
  };
  auto extraHeaders = endpoint.get("headers");
  if (extraHeaders && extraHeaders->get().isObject()) {
    for (auto& [name, value] : extraHeaders->get().asObject()) {
      if (value.isString()) headers.emplace_back(name, value.asString());
    }
  }

  HttpRequest request{
    methodFromString(endpoint.getString("method")),
    HttpUrlBuilder::build(network.baseUrl, path),
    std::move(headers),
    json::stringify(body),
    network.timeoutMs
  };

  HttpOutcome outcome = platform::httpExecute(request);

  if (auto* error = std::get_if<HttpNetworkError>(&outcome)) {
    return *error;
  }

  const auto& response = std::get<HttpResponse>(outcome);
  bool isSuccess = response.statusCode >= 200 && response.statusCode < 300;
  try {
    return SyncHttpResponse{response.statusCode, json::parse(response.body)};
  } catch (const std::exception& e) {
    // Non-2xx error bodies are often empty/plain-text/HTML — the caller only
    // needs the real statusCode (e.g. for 401 refresh), never the body.
    if (!isSuccess) return SyncHttpResponse{response.statusCode, json::Value(nullptr)};
    throw std::runtime_error(
      "SyncHttpCaller: failed to parse response body (status " +
      std::to_string(response.statusCode) + ") — " + e.what()
    );
  }
}

} // namespace margelo::nitro::salvedb
