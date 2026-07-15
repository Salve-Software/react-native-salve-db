#import "SalveDbSyncBridge.h"
#include "../../cpp/sync/SyncNativeEntryPoint.hpp"

@implementation SalveDbSyncBridge

+ (void)triggerSyncAll {
  margelo::nitro::salvedb::triggerSyncAllFromNative();
}

+ (void)wakeBackgroundSync {
  margelo::nitro::salvedb::wakeBackgroundSyncFromNative();
}

+ (BOOL)backgroundHasConfig {
  return margelo::nitro::salvedb::nativeBackgroundConstraints().hasConfig;
}

+ (double)backgroundMinimumIntervalMs {
  return margelo::nitro::salvedb::nativeBackgroundConstraints().minimumIntervalMs;
}

+ (BOOL)backgroundRequiresNetwork {
  return margelo::nitro::salvedb::nativeBackgroundConstraints().requiresNetwork;
}

+ (BOOL)backgroundRequiresCharging {
  return margelo::nitro::salvedb::nativeBackgroundConstraints().requiresCharging;
}

@end
