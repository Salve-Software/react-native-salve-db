Tests for `cpp/query/*` (currently `QueryExecutor`) go here, mirroring the
main `cpp/` layout. Nothing here yet — `QueryExecutor`'s behavior is covered
end-to-end through `cpp/tests/database/HybridSalveDatabaseTests.cpp` for now.
Add a dedicated file here if/when it needs coverage that doesn't go through
the full `HybridSalveDatabase` JSI bridge.
