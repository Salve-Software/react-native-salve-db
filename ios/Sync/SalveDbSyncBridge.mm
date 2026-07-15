#import "SalveDbSyncBridge.h"
#include "../../cpp/sync/SyncNativeEntryPoint.hpp"

@implementation SalveDbSyncBridge

+ (void)triggerSyncAll {
  margelo::nitro::salvedb::triggerSyncAllFromNative();
}

@end
