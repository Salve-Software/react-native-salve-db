#import "SalveDb-Swift.h"
#include "../cpp/http/HttpTypes.hpp"
#include "../cpp/platform/platform.hpp"
#include <dispatch/dispatch.h>
#include <stdexcept>

namespace margelo::nitro::salvedb::platform {

namespace {

const char* methodName(HttpMethod method) {
  switch (method) {
    case HttpMethod::Get: return "GET";
    case HttpMethod::Post: return "POST";
    case HttpMethod::Put: return "PUT";
    case HttpMethod::Patch: return "PATCH";
    case HttpMethod::Delete: return "DELETE";
  }
  throw std::runtime_error("SalveDb: unknown HttpMethod");
}

HttpNetworkErrorKind parseErrorKind(NSString* kind) {
  if ([kind isEqualToString:@"TIMEOUT"]) return HttpNetworkErrorKind::Timeout;
  if ([kind isEqualToString:@"NO_CONNECTION"]) return HttpNetworkErrorKind::NoConnection;
  if ([kind isEqualToString:@"CANCELLED"]) return HttpNetworkErrorKind::Cancelled;
  return HttpNetworkErrorKind::Other;
}

} // namespace

// Bridges the async Swift adapter to the synchronous platform::httpExecute
// contract via a semaphore — only called off the main/JS thread.
HttpOutcome httpExecute(const HttpRequest& request) {
  NSMutableArray<NSString*>* headerNames = [NSMutableArray arrayWithCapacity:request.headers.size()];
  NSMutableArray<NSString*>* headerValues = [NSMutableArray arrayWithCapacity:request.headers.size()];
  for (const auto& [name, value] : request.headers) {
    NSString* headerName = [NSString stringWithUTF8String:name.c_str()];
    NSString* headerValue = [NSString stringWithUTF8String:value.c_str()];
    if (headerName == nil || headerValue == nil) {
      return HttpNetworkError{HttpNetworkErrorKind::Other, "invalid UTF-8 in request header"};
    }
    [headerNames addObject:headerName];
    [headerValues addObject:headerValue];
  }

  NSString* body = nil;
  if (request.body.has_value()) {
    body = [NSString stringWithUTF8String:request.body->c_str()];
    if (body == nil) {
      return HttpNetworkError{HttpNetworkErrorKind::Other, "invalid UTF-8 in request body"};
    }
  }

  NSString* urlString = [NSString stringWithUTF8String:request.url.c_str()];
  if (urlString == nil) {
    return HttpNetworkError{HttpNetworkErrorKind::Other, "invalid UTF-8 in request URL"};
  }

  __block SalveDbHttpBridgeOutcome* result = nil;
  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);

  SalveDbHttpBridge* bridge = [SalveDbHttpBridge new];
  [bridge executeWithMethod:[NSString stringWithUTF8String:methodName(request.method)]
                         url:urlString
                 headerNames:headerNames
                headerValues:headerValues
                        body:body
                   timeoutMs:request.timeoutMs
                  completion:^(SalveDbHttpBridgeOutcome* outcome) {
                    result = outcome;
                    dispatch_semaphore_signal(semaphore);
                  }];

  dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);

  if (result.isSuccess) {
    HttpHeaders headers;
    NSUInteger count = MIN(result.responseHeaderNames.count, result.responseHeaderValues.count);
    headers.reserve(count);
    for (NSUInteger i = 0; i < count; i++) {
      headers.emplace_back(result.responseHeaderNames[i].UTF8String, result.responseHeaderValues[i].UTF8String);
    }
    return HttpResponse{static_cast<int>(result.statusCode), std::move(headers), result.responseBody.UTF8String};
  }

  return HttpNetworkError{parseErrorKind(result.errorKind), result.errorMessage.UTF8String};
}

} // namespace margelo::nitro::salvedb::platform
