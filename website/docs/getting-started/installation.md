---
title: Installation
sidebar_label: Installation
---

## Requirements

| Component | Requirement |
|---|---|
| React Native | 0.86+ |
| `react-native-nitro-modules` | 0.36+ |
| Node | 22.11+ |
| Xcode | 15+ (iOS) |
| Android | `minSdk` 23, NDK 27.1.12297006 |

## Install the package

```bash
npm install @salve-software/react-native-salve-db react-native-nitro-modules
```

## iOS

Install pods:

```bash
cd ios && pod install && cd ..
```

Background sync and the OAuth2 credential provider both need explicit entitlements. Add to your app
target:

**`Info.plist`**

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>com.salvedb.background.sync</string>
</array>
<key>UIBackgroundModes</key>
<array>
  <string>processing</string>
</array>
```

**`*.entitlements`**

```xml
<key>keychain-access-groups</key>
<array>
  <string>$(AppIdentifierPrefix)$(CFBundleIdentifier)</string>
</array>
```

> Without these, the app builds and runs fine — the background scheduler just never fires and the
> credential provider can't persist tokens. There's no runtime error to point you at it, so it's easy
> to miss.

## Android

None. The library declares `INTERNET` and `ACCESS_NETWORK_STATE` in its own manifest and registers the
`WorkManager` job automatically — a Gradle sync is enough.

## What's next

Continue to the [Quick Start](quick-start.md) to define your first schema and run a query.
