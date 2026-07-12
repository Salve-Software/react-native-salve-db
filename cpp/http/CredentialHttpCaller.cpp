#include "CredentialHttpCaller.hpp"
#include "HttpUrlBuilder.hpp"
#include "../platform/platform.hpp"
#include <stdexcept>
#include <variant>

namespace margelo::nitro::salvedb {

CredentialProvider::HttpCaller CredentialHttpCaller::create(const NetworkConfig& network) {
  return [network](const std::string& endpoint, const json::Value& requestBody) -> RefreshHttpResponse {
    HttpRequest request{
      HttpMethod::Post,
      HttpUrlBuilder::build(network.baseUrl, endpoint),
      {{"Content-Type", "application/json"}},
      json::stringify(requestBody),
      network.timeoutMs
    };

    HttpOutcome outcome = platform::httpExecute(request);

    if (auto* error = std::get_if<HttpNetworkError>(&outcome)) {
      throw std::runtime_error("CredentialHttpCaller: refresh request failed — " + error->message);
    }

    const auto& response = std::get<HttpResponse>(outcome);
    return RefreshHttpResponse{response.statusCode, json::parse(response.body)};
  };
}

} // namespace margelo::nitro::salvedb
