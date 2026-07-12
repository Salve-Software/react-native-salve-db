#import "Bridge.h"
#include "../cpp/http/IHttpClient.hpp"

using namespace margelo::nitro::salvedb;

namespace {

NSString* httpMethodToNSString(HttpMethod method) {
  switch (method) {
    case HttpMethod::Get: return @"GET";
    case HttpMethod::Post: return @"POST";
    case HttpMethod::Put: return @"PUT";
    case HttpMethod::Patch: return @"PATCH";
    case HttpMethod::Delete: return @"DELETE";
  }
  return @"GET";
}

HttpNetworkErrorKind toCppErrorKind(SalveDbHttpNetworkErrorKind kind) {
  switch (kind) {
    case SalveDbHttpNetworkErrorKindTimeout: return HttpNetworkErrorKind::Timeout;
    case SalveDbHttpNetworkErrorKindNoConnection: return HttpNetworkErrorKind::NoConnection;
    case SalveDbHttpNetworkErrorKindCancelled: return HttpNetworkErrorKind::Cancelled;
    case SalveDbHttpNetworkErrorKindOther: return HttpNetworkErrorKind::Other;
  }
  return HttpNetworkErrorKind::Other;
}

} // namespace

namespace margelo::nitro::salvedb {

// Implements IHttpClient by delegating to a Swift URLSessionAdapter conforming
// to IHttpClientProtocol. Not yet instantiated anywhere in production —
// TASK-012 owns wiring a live instance into SyncOrchestrator.
class ObjCHttpClientAdapter: public IHttpClient {
public:
  explicit ObjCHttpClientAdapter(id<IHttpClientProtocol> impl): _impl(impl) {}

  void execute(const HttpRequest& request, std::function<void(HttpOutcome)> callback) override {
    NSMutableArray<NSString*>* headerNames = [NSMutableArray arrayWithCapacity:request.headers.size()];
    NSMutableArray<NSString*>* headerValues = [NSMutableArray arrayWithCapacity:request.headers.size()];
    for (const auto& header : request.headers) {
      [headerNames addObject:[NSString stringWithUTF8String:header.first.c_str()]];
      [headerValues addObject:[NSString stringWithUTF8String:header.second.c_str()]];
    }

    [_impl executeWithMethod:httpMethodToNSString(request.method)
                          url:[NSString stringWithUTF8String:request.url.c_str()]
                  headerNames:headerNames
                 headerValues:headerValues
                         body:[NSString stringWithUTF8String:request.body.c_str()]
                    timeoutMs:request.timeoutMs
                   completion:^(NSInteger status, NSString* _Nullable body,
                                 NSArray<NSString*>* _Nullable respHeaderNames,
                                 NSArray<NSString*>* _Nullable respHeaderValues,
                                 BOOL isNetworkError, SalveDbHttpNetworkErrorKind errorKind,
                                 NSString* _Nullable errorMessage) {
      if (isNetworkError) {
        callback(HttpNetworkError{toCppErrorKind(errorKind), errorMessage ? errorMessage.UTF8String : ""});
        return;
      }

      HttpHeaders headers;
      NSUInteger count = respHeaderNames ? respHeaderNames.count : 0;
      headers.reserve(count);
      for (NSUInteger i = 0; i < count; i++) {
        headers.emplace_back(respHeaderNames[i].UTF8String, respHeaderValues[i].UTF8String);
      }
      callback(HttpResponse{static_cast<int>(status), body ? body.UTF8String : "", headers});
    }];
  }

private:
  id<IHttpClientProtocol> _impl;
};

} // namespace margelo::nitro::salvedb
