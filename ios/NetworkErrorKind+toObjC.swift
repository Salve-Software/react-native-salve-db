extension NetworkErrorKind {
  func toObjC() -> HttpNetworkErrorKind {
    switch self {
    case .timeout: return .timeout
    case .noConnection: return .noConnection
    case .cancelled: return .cancelled
    case .other: return .other
    }
  }
}
