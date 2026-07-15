#pragma once

#include "../http/HttpTypes.hpp"
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

// Notifies the platform layer to (re)register the native background job
// from DatabaseManager's current background config. Called at the end of
// Database.configure(). Android/iOS implementations must not throw.
void scheduleBackgroundSync();

// Executes an HTTP request and blocks the calling thread until it completes.
// Same discipline as the functions above: only call from a native background
// thread (e.g. inside Promise<T>::async), never from the JS thread.
HttpOutcome httpExecute(const HttpRequest& request);

} // namespace margelo::nitro::salvedb::platform
