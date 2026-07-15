#include <catch2/catch_test_macros.hpp>
#include "../../database/DatabaseManager.hpp"
#include "../../sync/SyncNativeEntryPoint.hpp"

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbName(const std::string& testName) {
  static int counter = 0;
  return testName + "_" + std::to_string(++counter);
}

} // namespace

// Note: the "DatabaseManager not open yet" guard (native calls arriving
// before JS has run Database.configure()) is not covered here — this test
// binary shares one process-wide DatabaseManager singleton with no reset,
// so once any other test has opened it, "not open" can't be reproduced
// deterministically. Verified by code inspection instead (see
// triggerSyncAllFromNative's isOpen() check) and by the manual verification
// checklist for issue #60.

TEST_CASE("triggerSyncAllFromNative swallows contention instead of throwing", "[sync][SyncNativeEntryPoint]") {
  DatabaseManager::shared().open(uniqueDbName("native_entry_point_contention"));

  auto held = DatabaseManager::shared().lockSync();

  REQUIRE_NOTHROW(triggerSyncAllFromNative());
}
