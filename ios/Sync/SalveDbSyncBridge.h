#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef struct {
  bool hasConfig;
  double minimumIntervalMs;
  bool requiresNetwork;
  bool requiresCharging;
} SalveDbBackgroundConstraints;

// ObjC-visible entry point into the C++ sync engine, for
// SalveDbConnectivityMonitor.swift — Swift/C++ direct interop isn't used
// elsewhere in this module yet, so this mirrors the existing
// SalveDbHttpBridge pattern instead (ObjC++ shim, `.mm` includes the C++
// header directly).
@interface SalveDbSyncBridge : NSObject

+ (void)triggerSyncAll;

+ (void)wakeBackgroundSync;
+ (SalveDbBackgroundConstraints)backgroundConstraints;

@end

NS_ASSUME_NONNULL_END
