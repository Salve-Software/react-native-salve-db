#pragma once

namespace margelo::nitro::salvedb {

// Entry point for native (non-JS) sync triggers — e.g. the Android/iOS
// connectivity monitor calling directly from Kotlin/Swift. Never throws:
// swallows everything internally, since a native caller crossing back into
// JNI/Swift with an unhandled C++ exception would crash the app.
void triggerSyncAllFromNative();

} // namespace margelo::nitro::salvedb
