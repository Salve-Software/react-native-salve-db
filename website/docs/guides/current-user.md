---
title: Current User
---

Salve DB has no concept of "the logged-in user" baked into schemas or the
query builder — `userId` (or whatever you name it) is an ordinary column of
your own schema. What the library provides is a small in-memory convenience,
`currentUser()`, so you don't have to thread the current user id through
every query call site by hand.

## Setting and reading the current user

```ts
import { Database } from '@salve-software/react-native-salve-db';

// once at login, and again on every cold start once your app's own
// session has been rehydrated
Database.setCurrentUser(session.userId);

Database.getCurrentUser(); // 'abc123' | null — never throws

Database.logout(); // clears stored credential tokens *and* the current user
Database.reset();  // wipes local data/schemas/config *and* the current user
```

- `Database.setCurrentUser(id: string)` — registers the id used by `currentUser()`.
  Throws if `id` is empty/whitespace.
- `Database.getCurrentUser()` — non-throwing read; returns `null` if unset.
- `Database.logout()` — clears stored OAuth2 tokens for a normal sign-out; local
  data, schemas, and config are untouched. Also clears the current user.
- `Database.reset()` — full teardown (local data, schemas, config). Also clears
  the current user.

## `currentUser()`

```ts
import { currentUser } from '@salve-software/react-native-salve-db';

function currentUser(): string;
```

Resolves to the id set by `Database.setCurrentUser()`, for use as a value
inside `.where()`/`.values()`:

```ts
import { Database, currentUser, eq } from '@salve-software/react-native-salve-db';
import { TaskSchema } from './schemas/TaskSchema';

Database.select(TaskSchema).where(eq('userId', currentUser())).limit(50).execute();
Database.insert(TaskSchema).values({ userId: currentUser(), title: 'Buy milk' }).execute();
```

Three things to keep in mind:

- **It's a value convenience, not a security boundary or an automatic row-level
  filter.** `currentUser()` only resolves an id — it does not enforce that any
  query filters by it. A query that omits `eq('userId', currentUser())` still
  reads or writes across every user's rows; adding the filter on every query
  that needs it is on you.
- **It throws if unset.** Calling `currentUser()` before `Database.setCurrentUser()`
  has ever run throws `currentUser(): no user set — call Database.setCurrentUser() first`,
  deliberately failing loud instead of silently resolving to `null` (which would
  compile to `WHERE userId = NULL`, matching zero rows with no clue why). Use
  `Database.getCurrentUser()` when you need a non-throwing check instead.
- **It's in-memory only.** Unlike credential tokens (stored in Keychain/Keystore
  by the native credential provider), the current user id is not persisted by
  this library. It does not survive an app restart — call `Database.setCurrentUser()`
  again on every cold start, once your app's own session/auth state has been
  rehydrated.

See the [Query Builder](../guides/query-builder.md) guide for `eq` and the
other condition operators, and [Hooks](../guides/hooks.md) for combining
`currentUser()` with `useQuery`/`useInfiniteQuery`'s `deps`.
