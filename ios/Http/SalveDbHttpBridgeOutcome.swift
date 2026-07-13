import Foundation

// ObjC-visible marshaling type only — PlatformHttp.mm reads these plain
// properties directly. `public` is required: with C++/ObjC interop mode
// active in this module, internal (default) declarations don't reach the
// generated header even within the same target.
@objc(SalveDbHttpBridgeOutcome) public final class SalveDbHttpBridgeOutcome: NSObject {
  @objc public let isSuccess: Bool
  @objc public let statusCode: Int
  @objc public let responseHeaderNames: [String]
  @objc public let responseHeaderValues: [String]
  @objc public let responseBody: String
  @objc public let errorKind: String
  @objc public let errorMessage: String

  init(
    isSuccess: Bool,
    statusCode: Int,
    responseHeaderNames: [String],
    responseHeaderValues: [String],
    responseBody: String,
    errorKind: String,
    errorMessage: String
  ) {
    self.isSuccess = isSuccess
    self.statusCode = statusCode
    self.responseHeaderNames = responseHeaderNames
    self.responseHeaderValues = responseHeaderValues
    self.responseBody = responseBody
    self.errorKind = errorKind
    self.errorMessage = errorMessage
  }

  static func from(_ outcome: HttpOutcome) -> SalveDbHttpBridgeOutcome {
    switch outcome {
    case .success(let response):
      return SalveDbHttpBridgeOutcome(
        isSuccess: true,
        statusCode: response.statusCode,
        responseHeaderNames: response.headers.map { $0.name },
        responseHeaderValues: response.headers.map { $0.value },
        responseBody: response.body,
        errorKind: "",
        errorMessage: ""
      )
    case .networkError(let error):
      return SalveDbHttpBridgeOutcome(
        isSuccess: false,
        statusCode: 0,
        responseHeaderNames: [],
        responseHeaderValues: [],
        responseBody: "",
        errorKind: error.kind.rawValue,
        errorMessage: error.message
      )
    }
  }
}
