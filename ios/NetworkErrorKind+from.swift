import Foundation

extension NetworkErrorKind {
  static func from(_ error: Error) -> NetworkErrorKind {
    guard let urlError = error as? URLError else { return .other }
    switch urlError.code {
    case .timedOut: return .timeout
    case .notConnectedToInternet, .cannotFindHost, .cannotConnectToHost, .networkConnectionLost: return .noConnection
    case .cancelled: return .cancelled
    default: return .other
    }
  }
}
