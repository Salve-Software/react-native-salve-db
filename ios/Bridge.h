//
//  Bridge.h
//  salve-db
//
//  Created by salvesoftware on 7/9/2026
//

#pragma once

#import <Foundation/Foundation.h>

// Prefixed to avoid colliding with margelo::nitro::salvedb::HttpNetworkErrorKind
// in ObjC++ translation units that `using namespace` that C++ namespace.
typedef NS_ENUM(NSInteger, SalveDbHttpNetworkErrorKind) {
  SalveDbHttpNetworkErrorKindTimeout,
  SalveDbHttpNetworkErrorKindNoConnection,
  SalveDbHttpNetworkErrorKindCancelled,
  SalveDbHttpNetworkErrorKindOther,
} NS_SWIFT_NAME(HttpNetworkErrorKind);

NS_ASSUME_NONNULL_BEGIN

@protocol IHttpClientProtocol <NSObject>
- (void)executeWithMethod:(NSString *)method
                       url:(NSString *)url
               headerNames:(NSArray<NSString *> *)headerNames
              headerValues:(NSArray<NSString *> *)headerValues
                      body:(NSString *)body
                 timeoutMs:(double)timeoutMs
                completion:(void (^)(NSInteger status, NSString * _Nullable body,
                                      NSArray<NSString *> * _Nullable headerNames,
                                      NSArray<NSString *> * _Nullable headerValues,
                                      BOOL isNetworkError, SalveDbHttpNetworkErrorKind errorKind,
                                      NSString * _Nullable errorMessage))completion
  NS_SWIFT_NAME(execute(method:url:headerNames:headerValues:body:timeoutMs:completion:));
@end

NS_ASSUME_NONNULL_END
