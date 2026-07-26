import Foundation

extension HttpErrorKind {
  static func from(_ error: URLError) -> HttpErrorKind {
    switch error.code {
    case .timedOut:
      return .timeout
    case .notConnectedToInternet, .cannotFindHost, .cannotConnectToHost, .networkConnectionLost, .dnsLookupFailed:
      return .noConnection
    case .cancelled:
      return .cancelled
    default:
      return .other
    }
  }
}
