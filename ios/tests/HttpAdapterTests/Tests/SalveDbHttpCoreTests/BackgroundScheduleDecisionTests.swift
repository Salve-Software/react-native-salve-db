import XCTest
@testable import SalveDbHttpCore

final class BackgroundScheduleDecisionTests: XCTestCase {

  func testNoConfigCancels() {
    let decision = backgroundScheduleDecision(
      hasConfig: false,
      minimumIntervalMs: 900000,
      requiresNetwork: true,
      requiresCharging: true
    )

    XCTAssertEqual(decision, .cancel)
  }

  func testEnqueueConvertsMillisecondsToSeconds() {
    let decision = backgroundScheduleDecision(
      hasConfig: true,
      minimumIntervalMs: 900000,
      requiresNetwork: false,
      requiresCharging: false
    )

    XCTAssertEqual(decision, .enqueue(secondsFromNow: 900, requiresNetwork: false, requiresCharging: false))
  }

  func testRequiresNetworkAndRequiresChargingAreCarriedThroughIndependently() {
    let decision = backgroundScheduleDecision(
      hasConfig: true,
      minimumIntervalMs: 60000,
      requiresNetwork: true,
      requiresCharging: false
    )

    XCTAssertEqual(decision, .enqueue(secondsFromNow: 60, requiresNetwork: true, requiresCharging: false))
  }
}
