#pragma once

#include <string>

namespace margelo::nitro::salvedb::platform {

// Returns the platform documents/files directory (no trailing slash).
// iOS:     NSDocumentDirectory
// Android: context.filesDir (set during package init via setDocumentsDirectory)
std::string getDocumentsDirectory();

// Called from Android package init (JNI) before configure() is invoked.
void setDocumentsDirectory(const std::string& path);

} // namespace margelo::nitro::salvedb::platform
