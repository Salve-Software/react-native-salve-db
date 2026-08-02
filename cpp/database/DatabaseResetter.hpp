#pragma once

namespace margelo::nitro::salvedb {

/** Implements Database.reset(): wipes all local data and credentials in place, keeping the connection alive. */
class DatabaseResetter {
public:
  // Lock-agnostic — the caller (HybridSalveDatabase::reset()) holds DatabaseManager::shared().lockSync().
  static void reset();
};

} // namespace margelo::nitro::salvedb
