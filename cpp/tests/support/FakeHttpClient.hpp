#pragma once

#include "../../http/IHttpClient.hpp"
#include <vector>

namespace margelo::nitro::salvedb::tests {

class FakeHttpClient: public IHttpClient {
public:
  explicit FakeHttpClient(HttpOutcome outcome): _outcome(std::move(outcome)) {}

  void execute(const HttpRequest& request, std::function<void(HttpOutcome)> callback) override {
    capturedRequests.push_back(request);
    callback(_outcome);
  }

  std::vector<HttpRequest> capturedRequests;

private:
  HttpOutcome _outcome;
};

} // namespace margelo::nitro::salvedb::tests
