#import "SalveDb-Swift.h"
#import <Foundation/Foundation.h>

@interface SalveDbLifecycleBootstrap : NSObject
@end

@implementation SalveDbLifecycleBootstrap

+ (void)load {
  [SalveDbConnectivityMonitor start];
}

@end
