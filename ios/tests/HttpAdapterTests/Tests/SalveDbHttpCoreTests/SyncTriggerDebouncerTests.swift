import XCTest
@testable import SalveDbHttpCore

final class SyncTriggerDebouncerTests: XCTestCase {

  func testASingleSignalFires() {
    var fireCount = 0
    let now: TimeInterval = 0
    let debouncer = SyncTriggerDebouncer(windowSeconds: 5, now: { now }, onFire: { fireCount += 1 })

    debouncer.signal()

    XCTAssertEqual(fireCount, 1)
  }

  func testRapidSignalsWithinTheWindowFireExactlyOnce() {
    var fireCount = 0
    var now: TimeInterval = 0
    let debouncer = SyncTriggerDebouncer(windowSeconds: 5, now: { now }, onFire: { fireCount += 1 })

    debouncer.signal()
    now += 1
    debouncer.signal()
    now += 1
    debouncer.signal()
    now += 2
    debouncer.signal() // still < 5s since the first signal

    XCTAssertEqual(fireCount, 1)
  }

  func testSignalsSeparatedByMoreThanTheWindowEachFire() {
    var fireCount = 0
    var now: TimeInterval = 0
    let debouncer = SyncTriggerDebouncer(windowSeconds: 5, now: { now }, onFire: { fireCount += 1 })

    debouncer.signal()
    now += 5.001
    debouncer.signal()

    XCTAssertEqual(fireCount, 2)
  }
}
