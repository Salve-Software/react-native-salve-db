#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// ObjC-visible entry point into the C++ sync engine, for
// SalveDbConnectivityMonitor.swift — Swift/C++ direct interop isn't used
// elsewhere in this module yet, so this mirrors the existing
// SalveDbHttpBridge pattern instead (ObjC++ shim, `.mm` includes the C++
// header directly).
@interface SalveDbSyncBridge : NSObject

+ (void)triggerSyncAll;

@end

NS_ASSUME_NONNULL_END
