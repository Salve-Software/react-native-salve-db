#include "SyncHttpCaller.hpp"
#include "HttpUrlBuilder.hpp"
#include "../platform/platform.hpp"
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

} // namespace

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
  try {
    return SyncHttpResponse{response.statusCode, json::parse(response.body)};
  } catch (const std::exception& e) {
    throw std::runtime_error(
      "SyncHttpCaller: failed to parse response body (status " +
      std::to_string(response.statusCode) + ") — " + e.what()
    );
  }
}

} // namespace margelo::nitro::salvedb
