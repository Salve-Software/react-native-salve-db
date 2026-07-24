#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../database/SalveMetadataManager.hpp"
#include "../../platform/platform.hpp"
#include <memory>

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbPath(const std::string& testName) {
  static int counter = 0;
  return platform::getDocumentsDirectory() + "/" + testName + "_" + std::to_string(++counter) + ".db";
}

std::shared_ptr<SQLiteConnection> openWithCustomers(const std::string& testName) {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath(testName));
  MigrationEngine engine(conn);
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": {
      "id": { "type": "text" },
      "name": { "type": "text" },
      "updatedAt": { "type": "datetime", "nullable": false }
    },
    "sync": { "enabled": true }
  })"));
  return conn;
}

} // namespace

TEST_CASE("getByLocalId returns the row's entityId", "[sync][SalveMetadataManager]") {
  auto conn = openWithCustomers("metadata_get_by_local_id");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});

  SalveMetadataManager metadata(conn);
  auto row = metadata.getByLocalId("customers", "temp-1");

  REQUIRE(row.has_value());
  REQUIRE(row->entityId == "temp-1");
  REQUIRE(row->status == "PENDING");
}

TEST_CASE("markReplaced updates entityId/remoteId/status/syncedAt and preserves localId", "[sync][SalveMetadataManager]") {
  auto conn = openWithCustomers("metadata_mark_replaced");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});

  SalveMetadataManager metadata(conn);
  metadata.markReplaced("customers", "temp-1", "srv-1", 999);

  auto row = metadata.getByLocalId("customers", "temp-1");
  REQUIRE(row.has_value());
  REQUIRE(row->localId == "temp-1");
  REQUIRE(row->entityId == "srv-1");
  REQUIRE(row->remoteId == "srv-1");
  REQUIRE(row->status == "SYNCED");
  REQUIRE(row->syncedAt == 999);
}

TEST_CASE("markDeletedSynced stamps syncedAt and keeps status DELETED", "[sync][SalveMetadataManager]") {
  auto conn = openWithCustomers("metadata_mark_deleted_synced");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'alice', 100)", {});
  conn->execute("DELETE FROM customers WHERE id = '1'", {});

  SalveMetadataManager metadata(conn);
  metadata.markDeletedSynced("customers", "1", 999);

  auto row = metadata.getByLocalId("customers", "1");
  REQUIRE(row.has_value());
  REQUIRE(row->status == "DELETED");
  REQUIRE(row->syncedAt == 999);
}

TEST_CASE("backfillSyncedRows writes entityId equal to the primary key", "[sync][SalveMetadataManager]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("metadata_backfill"));
  MigrationEngine plainEngine(conn);
  plainEngine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": {
      "id": { "type": "text" },
      "name": { "type": "text" },
      "updatedAt": { "type": "datetime", "nullable": false }
    }
  })"));
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('pre-existing', 'alice', 100)", {});

  MigrationEngine engine(conn);
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 2, "primaryKey": "id",
    "columns": {
      "id": { "type": "text" },
      "name": { "type": "text" },
      "updatedAt": { "type": "datetime", "nullable": false }
    },
    "sync": { "enabled": true }
  })"));

  SalveMetadataManager metadata(conn);
  auto row = metadata.getByLocalId("customers", "pre-existing");
  REQUIRE(row.has_value());
  REQUIRE(row->entityId == "pre-existing");
  REQUIRE(row->status == "PENDING");
}
