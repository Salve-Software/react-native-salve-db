#import <Foundation/Foundation.h>
#include "../cpp/platform/platform.hpp"

namespace margelo::nitro::salvedb::platform {

// s_baseDirectory is not used on iOS — documents dir is resolved on demand.
void setDocumentsDirectory(const std::string&) {}

std::string getDocumentsDirectory() {
  NSArray<NSString*>* paths =
    NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  if (paths.count == 0)
    return "/tmp/salvedb";
  return std::string(paths.firstObject.UTF8String);
}

} // namespace margelo::nitro::salvedb::platform
