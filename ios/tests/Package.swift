// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "SalveDbHttpTests",
  platforms: [.macOS(.v13)],
  targets: [
    // Sources/SalveDbHttp/*.swift are symlinks into ../*.swift — SPM targets
    // can't point outside the package root, so this avoids duplicating them.
    .target(name: "SalveDbHttp"),
    .testTarget(name: "SalveDbHttpTests", dependencies: ["SalveDbHttp"]),
  ]
)
