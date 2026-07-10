#include "../../database/platform.hpp"
#include <cstdlib>
#include <stdexcept>
#include <unistd.h>

namespace margelo::nitro::salvedb {

// Host test double for cpp/database/platform.hpp: returns a fresh temp
// directory per process instead of the real iOS/Android documents dir.
void setPlatformDocumentsDirectory(const std::string&) {}

std::string getPlatformDocumentsDirectory() {
  static std::string dir = []() {
    std::string tmpl = "/tmp/salvedb_tests.XXXXXX";
    char* result = mkdtemp(tmpl.data());
    if (!result) throw std::runtime_error("mkdtemp failed for test documents directory");
    return std::string(result);
  }();
  return dir;
}

} // namespace margelo::nitro::salvedb
