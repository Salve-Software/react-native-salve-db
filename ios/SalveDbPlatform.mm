#import <Foundation/Foundation.h>
#include "../cpp/database/platform.hpp"

namespace margelo::nitro::salvedb {

// s_baseDirectory is not used on iOS — documents dir is resolved on demand.
void setPlatformDocumentsDirectory(const std::string&) {}

std::string getPlatformDocumentsDirectory() {
  NSArray<NSString*>* paths =
    NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  if (paths.count == 0)
    return "/tmp/salvedb";
  return std::string(paths.firstObject.UTF8String);
}

} // namespace margelo::nitro::salvedb
