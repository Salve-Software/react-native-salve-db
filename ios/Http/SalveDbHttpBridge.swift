import Foundation

// ObjC-visible entry point for PlatformHttp.mm — HttpRequest/HttpOutcome
// aren't representable in Objective-C, so this flattens to plain types.
// `public` is required for the generated header to expose it (see
// SalveDbHttpBridgeOutcome.swift).
@objc(SalveDbHttpBridge) public final class SalveDbHttpBridge: NSObject {
  private let adapter = HttpAdapter()

  public override init() {}

  @objc public func execute(
    method: String,
    url: String,
    headerNames: [String],
    headerValues: [String],
    body: String?,
    timeoutMs: Double,
    completion: @escaping (SalveDbHttpBridgeOutcome) -> Void
  ) {
    guard let httpMethod = HttpMethod(rawValue: method) else {
      completion(SalveDbHttpBridgeOutcome(
        isSuccess: false, statusCode: 0, responseHeaderNames: [], responseHeaderValues: [],
        responseBody: "", errorKind: "OTHER", errorMessage: "unknown HTTP method: \(method)"
      ))
      return
    }

    let headerCount = min(headerNames.count, headerValues.count)
    let headers = (0..<headerCount).map { (name: headerNames[$0], value: headerValues[$0]) }
    let request = HttpRequest(method: httpMethod, url: url, headers: headers, body: body, timeoutMs: timeoutMs)

    adapter.execute(request) { outcome in
      completion(SalveDbHttpBridgeOutcome.from(outcome))
    }
  }
}
