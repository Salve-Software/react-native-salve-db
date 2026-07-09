#pragma once

#include <string>

namespace margelo::nitro::salvedb {

// Returns the platform documents/files directory (no trailing slash).
// iOS:     NSDocumentDirectory
// Android: context.filesDir (set during package init via setPlatformDocumentsDirectory)
std::string getPlatformDocumentsDirectory();

// Called from Android package init (JNI) before configure() is invoked.
void setPlatformDocumentsDirectory(const std::string& path);

} // namespace margelo::nitro::salvedb
