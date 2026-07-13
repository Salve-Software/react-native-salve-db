// Raw values match the string constants Android and C++ use for the same outcome.
enum HttpErrorKind: String {
  case timeout = "TIMEOUT"
  case noConnection = "NO_CONNECTION"
  case cancelled = "CANCELLED"
  case other = "OTHER"
}
