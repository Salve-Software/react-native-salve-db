---
title: salve-db-server (reference backend)
---

[`packages/salve-db-server`](https://github.com/Salve-Software/react-native-salve-db/tree/main/packages/salve-db-server) is a small, conventional, Postgres-backed reference REST backend implementing exactly the sync contract the native sync engine (`cpp/sync/`) expects — read it as the executable spec of "what shape does my own API need to have."

It's what the [`example/`](https://github.com/Salve-Software/react-native-salve-db/tree/main/example) app and the on-device `react-native-harness` test suite actually sync against. It is not published to npm (`private: true`) and isn't meant to be run in production — it exists so the contract has a real, working implementation you can read end to end, run locally, and diff your own backend against.

## Building your own backend

If you're implementing a server for your own app, don't reverse-engineer it from this package's source — start with the [Sync guide](./guides/sync.md), which documents the push/pull algorithm, retry behavior, and conflict handling from the client's point of view. Then use `packages/salve-db-server`'s [source on GitHub](https://github.com/Salve-Software/react-native-salve-db/tree/main/packages/salve-db-server) as a concrete, working example of a backend that satisfies it.
