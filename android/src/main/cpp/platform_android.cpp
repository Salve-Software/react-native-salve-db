#include "../../../../cpp/platform/platform.hpp"
#include <jni.h>
#include <string>

namespace margelo::nitro::salvedb::platform {

static std::string s_documentsDirectory;

void setDocumentsDirectory(const std::string& path) {
  s_documentsDirectory = path;
}

std::string getDocumentsDirectory() {
  return s_documentsDirectory;
}

} // namespace margelo::nitro::salvedb::platform

// Called from SalveDbPackage.kt via System.loadLibrary
extern "C" JNIEXPORT void JNICALL
Java_com_salvedb_SalveDbPackage_nativeSetDocumentsDir(JNIEnv* env, jclass, jstring path) {
  const char* str = env->GetStringUTFChars(path, nullptr);
  margelo::nitro::salvedb::platform::setDocumentsDirectory(std::string(str));
  env->ReleaseStringUTFChars(path, str);
}
