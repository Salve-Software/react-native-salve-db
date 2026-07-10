#include "../../../../cpp/database/platform.hpp"
#include <jni.h>
#include <string>

namespace margelo::nitro::salvedb {

static std::string s_documentsDirectory;

void setPlatformDocumentsDirectory(const std::string& path) {
  s_documentsDirectory = path;
}

std::string getPlatformDocumentsDirectory() {
  return s_documentsDirectory;
}

} // namespace margelo::nitro::salvedb

// Called from SalveDbPackage.kt via System.loadLibrary
extern "C" JNIEXPORT void JNICALL
Java_com_salvedb_SalveDbPackage_nativeSetDocumentsDir(JNIEnv* env, jclass, jstring path) {
  const char* str = env->GetStringUTFChars(path, nullptr);
  margelo::nitro::salvedb::setPlatformDocumentsDirectory(std::string(str));
  env->ReleaseStringUTFChars(path, str);
}
