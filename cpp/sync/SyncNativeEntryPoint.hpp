#pragma once

namespace margelo::nitro::salvedb {

// Entry point for native (non-JS) sync triggers — e.g. the Android/iOS
// connectivity monitor calling directly from Kotlin/Swift. Never throws:
// swallows everything internally, since a native caller crossing back into
// JNI/Swift with an unhandled C++ exception would crash the app.
void triggerSyncAllFromNative();

// Entry point for the native background scheduler (WorkManager/BGTaskScheduler).
// Rehydrates DatabaseManager from NativeConfigStore if needed, then
// delegates to triggerSyncAllFromNative(). Never throws.
void wakeBackgroundSyncFromNative();

struct NativeBackgroundConstraints {
  bool hasConfig;
  double minimumIntervalMs;
  bool requiresNetwork;
  bool requiresCharging;
};

NativeBackgroundConstraints nativeBackgroundConstraints();

} // namespace margelo::nitro::salvedb
