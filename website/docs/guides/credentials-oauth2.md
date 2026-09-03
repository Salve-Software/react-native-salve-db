---
title: OAuth2 Credentials
---

`Database.configure`'s `credentials` block declares an OAuth2 credential provider for sync
requests. Once configured, token storage and refresh are handled entirely by the native engine —
JS never sees the tokens again after the initial `configure()` call.

## `ICredentialsDefinition`

```ts
interface ICredentialsDefinition {
  provider: 'oauth2';
  accessToken?: {
    headerName?: string;   // default: "Authorization"
    scheme?: string;       // default: "Bearer"
  };
  tokens?: {
    accessToken: string;
    refreshToken: string;
  };
  refresh: {
    endpoint: string;
    response: {
      accessToken: JsonPath;
      refreshToken: JsonPath;
    };
  };
}
```

- **`provider`** — only `"oauth2"` is implemented.
- **`accessToken.headerName`** / **`accessToken.scheme`** — where the access token travels in sync
  requests, and the scheme prefix applied to it (e.g. `Authorization: Bearer <token>`). Default to
  `"Authorization"` and `"Bearer"`. Pass `scheme: ""` for APIs that expect the raw token with no
  scheme prefix.
- **`tokens`** — the initial access/refresh token pair, obtained by the app's own login flow (out of
  scope for this library) before calling `Database.configure()`. Stored natively (Keychain on iOS,
  Keystore on Android) and never re-read from JS afterwards — every subsequent refresh is 100%
  native.
- **`refresh.endpoint`** — the token-refresh route the native `CredentialProvider` calls on a 401.
- **`refresh.response`** — a [`JsonPath`](../architecture.md) pair (`accessToken`, `refreshToken`)
  telling the native engine where to find the new tokens in the refresh endpoint's response body.

```ts
credentials: {
  provider: 'oauth2',
  // accessToken.headerName/scheme default to "Authorization"/"Bearer" — override for custom APIs.
  tokens: { accessToken, refreshToken },
  refresh: {
    endpoint: '/auth/refresh',
    response: { accessToken: '$.accessToken', refreshToken: '$.refreshToken' },
  },
}
```

## Where tokens live

The initial `tokens.accessToken`/`tokens.refreshToken` pair passed to `configure()` is written once
into platform secure storage — the **Keychain** on iOS, the **Keystore** on Android — by the native
`CredentialProvider`. From that point on:

- JS never reads the tokens back. There is no `Database` API to retrieve the current access or
  refresh token.
- Every sync request's auth header is attached natively, using whatever token currently lives in
  secure storage.
- A refreshed token pair overwrites the stored pair natively; JS is never informed a refresh
  happened.

## Refresh is 100% native

When a sync HTTP call gets a `401`, the native engine — not JS — calls `refresh.endpoint` with the
stored refresh token, parses the new `accessToken`/`refreshToken` out of the response using the
configured `JsonPath` pair, writes them back into Keychain/Keystore, and retries the original call.
This happens whether the sync session was triggered from JS (`Database.sync()` / `syncAll()`), from
`syncOnAppOpen`, or from a background wake where the JS runtime was never even started — see
[Background Sync](../guides/background-sync.md). JS has no hook into this flow and no way to
intercept, delay, or observe an individual refresh.

For the sync contract these credentials authenticate, see [Sync](../guides/sync.md).
