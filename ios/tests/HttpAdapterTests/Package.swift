// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "HttpAdapterTests",
  platforms: [.macOS(.v13)],
  targets: [
    // Sources/SalveDbHttpCore/*.swift are symlinks to the production files in
    // ios/Http/ — SwiftPM doesn't allow a target path outside the package root.
    .target(name: "SalveDbHttpCore"),
    .testTarget(name: "SalveDbHttpCoreTests", dependencies: ["SalveDbHttpCore"], path: "Tests/SalveDbHttpCoreTests"),
  ]
)
