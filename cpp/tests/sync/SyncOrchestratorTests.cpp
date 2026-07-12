#include <catch2/catch_test_macros.hpp>
#include "../../sync/SyncOrchestrator.hpp"
#include "../support/FakeHttpClient.hpp"
#include <memory>

using namespace margelo::nitro::salvedb;
using margelo::nitro::salvedb::tests::FakeHttpClient;

TEST_CASE("SyncOrchestrator accepts an IHttpClient via constructor without changing triggerSync behavior", "[sync][SyncOrchestrator]") {
  auto fake = std::make_shared<FakeHttpClient>(HttpResponse{200, "{}", {}});
  SyncOrchestrator orchestrator(fake);

  REQUIRE(orchestrator.httpClient() == fake);
  REQUIRE_THROWS_AS(orchestrator.triggerSync("customers"), std::runtime_error);
}

TEST_CASE("SyncOrchestrator accepts an IHttpClient via setter", "[sync][SyncOrchestrator]") {
  auto fake = std::make_shared<FakeHttpClient>(HttpResponse{200, "{}", {}});
  SyncOrchestrator orchestrator;
  REQUIRE(orchestrator.httpClient() == nullptr);

  orchestrator.setHttpClient(fake);
  REQUIRE(orchestrator.httpClient() == fake);
}
