#pragma once

#include <optional>
#include <string>

namespace margelo::nitro::salvedb::platform {

// Returns the platform documents/files directory (no trailing slash).
// iOS:     NSDocumentDirectory
// Android: context.filesDir (set during package init via setDocumentsDirectory)
std::string getDocumentsDirectory();

// Called from Android package init (JNI) before configure() is invoked.
void setDocumentsDirectory(const std::string& path);

// Secure key/value storage for credentials — the only storage the
// CredentialProvider is allowed to use. Never crosses the JSI bridge.
// iOS:     Keychain (Security framework)
// Android: Keystore-backed EncryptedSharedPreferences
void setSecureValue(const std::string& key, const std::string& value);
std::optional<std::string> getSecureValue(const std::string& key);
void deleteSecureValue(const std::string& key);

} // namespace margelo::nitro::salvedb::platform
