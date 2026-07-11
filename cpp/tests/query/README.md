Tests for `cpp/query/*` (currently `QueryExecutor`) go here, mirroring the
main `cpp/` layout. `QueryExecutorTests.cpp` covers behavior specific to this
layer (boolean coercion, distinguishable SQL errors, triggers via `db.execute`)
through the real `HybridSalveDatabase` JSI bridge; happy-path SELECT/INSERT/
UPDATE/DELETE round-tripping stays in `cpp/tests/database/HybridSalveDatabaseTests.cpp`.
