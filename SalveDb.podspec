require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "SalveDb"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported, :visionos => 1.0 }
  s.source       = { :git => "https://github.com/eumaninho54/react-native-salve-db.git", :tag => "#{s.version}" }

  s.source_files = [
    # Implementation (Swift)
    "ios/**/*.{swift}",
    # Objective-C headers shared between Swift and Objective-C++ (e.g. Bridge.h) — must
    # be a podspec source so CocoaPods puts it in the umbrella header Swift sees.
    "ios/**/*.h",
    # Autolinking/Registration + platform init (Objective-C++)
    "ios/**/*.{m,mm}",
    # Implementation (C++ objects)
    "cpp/**/*.{hpp,cpp}",
    # Vendored SQLite amalgamation (same source used on Android)
    "cpp/third_party/sqlite3/*.{c,h}",
  ]
  s.exclude_files = ["cpp/tests/**/*", "ios/tests/**/*"]
  # Without this, CocoaPods marks ios/**/*.h as "Project" headers (only visible via
  # relative #import in .m/.mm) instead of "Public" (visible to Swift via the umbrella header).
  s.public_header_files = "ios/**/*.h"

  # Needed for sqlite3_column_table_name/origin_name, used to coerce boolean columns on read.
  s.pod_target_xcconfig = { 'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) SQLITE_ENABLE_COLUMN_METADATA=1' }

  load 'nitrogen/generated/ios/SalveDb+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)
end
