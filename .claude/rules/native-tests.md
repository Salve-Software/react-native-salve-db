# Native tests (cpp/tests)

C++ core logic is tested end-to-end through a real Hermes JSI runtime — no simulator/emulator, runs in ~1s. See `cpp/tests/`.

- **Run `npm run test:native` after any change under `cpp/`.** Not optional.
- **Update tests in lockstep with `cpp/` changes, in the same change.** New/changed behavior needs new/changed coverage — a passing build is not a passing test suite.
- **Never game a test to pass.** Don't loosen an assertion, delete/skip a failing case, mock around the real code path, or adjust expected output just to turn it green. Fix the implementation. If an expectation was genuinely wrong, confirm that from actual observed behavior (not assumption) and fix the test with a comment explaining why.
- Tests must exercise the real `HybridSalveDatabase`/`SQLiteConnection`/etc. through the real JSI bridge, not a stand-in, and must guard against false positives — assert on the actual returned shape/value, not just "didn't throw".
- **Structure**: `cpp/tests/support/` holds shared harness code (`HybridDatabaseHarness`, `TestDispatcher`, platform stub). Test files mirror `cpp/`'s own layout — `cpp/database/*` → `cpp/tests/database/`, `cpp/query/*` → `cpp/tests/query/`, `cpp/sync/*` → `cpp/tests/sync/`.
