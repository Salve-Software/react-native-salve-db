#import "SalveDbSyncBridge.h"
#include "../../cpp/sync/SyncNativeEntryPoint.hpp"

@implementation SalveDbSyncBridge

+ (void)triggerSyncAll {
  margelo::nitro::salvedb::triggerSyncAllFromNative();
}

+ (void)wakeBackgroundSync {
  margelo::nitro::salvedb::wakeBackgroundSyncFromNative();
}

+ (SalveDbBackgroundConstraints)backgroundConstraints {
  auto constraints = margelo::nitro::salvedb::nativeBackgroundConstraints();
  return SalveDbBackgroundConstraints{
    constraints.hasConfig,
    constraints.minimumIntervalMs,
    constraints.requiresNetwork,
    constraints.requiresCharging,
  };
}

@end
