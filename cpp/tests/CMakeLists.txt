cmake_minimum_required(VERSION 3.19)
project(salvedb_tests CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)
FetchContent_Declare(
  Catch2
  GIT_REPOSITORY https://github.com/catchorg/Catch2.git
  GIT_TAG v3.7.1
)
FetchContent_MakeAvailable(Catch2)

if(NOT APPLE)
  message(FATAL_ERROR "salvedb_tests currently only supports macOS host builds (needs the vendored macOS hermesvm.framework).")
endif()

# ── Locate the Hermes prebuilt tarball fetched by `pod install` ─────────────
# We reuse the same artifact CocoaPods already downloaded instead of vendoring
# a large binary in the repo or re-fetching it ourselves.
file(GLOB HERMES_TARBALL
  "${CMAKE_SOURCE_DIR}/../../example/ios/Pods/hermes-engine-artifacts/hermes-ios-*-debug.tar.gz"
)
list(LENGTH HERMES_TARBALL HERMES_TARBALL_COUNT)
if(HERMES_TARBALL_COUNT EQUAL 0)
  message(FATAL_ERROR "Could not find hermes-ios-*-debug.tar.gz under example/ios/Pods/hermes-engine-artifacts. Run `cd example/ios && pod install` first.")
endif()
list(GET HERMES_TARBALL 0 HERMES_TARBALL)

set(HERMES_EXTRACT_DIR "${CMAKE_BINARY_DIR}/hermes-extract")
if(NOT EXISTS "${HERMES_EXTRACT_DIR}/destroot/include/hermes/hermes.h")
  message(STATUS "Extracting Hermes headers + macOS framework from ${HERMES_TARBALL}...")
  file(MAKE_DIRECTORY "${HERMES_EXTRACT_DIR}")
  execute_process(
    COMMAND tar -xzf "${HERMES_TARBALL}" destroot/include destroot/Library/Frameworks/macosx
    WORKING_DIRECTORY "${HERMES_EXTRACT_DIR}"
    RESULT_VARIABLE HERMES_EXTRACT_RESULT
  )
  if(NOT HERMES_EXTRACT_RESULT EQUAL 0)
    message(FATAL_ERROR "Failed to extract Hermes tarball")
  endif()
endif()

set(HERMES_INCLUDE_DIR "${HERMES_EXTRACT_DIR}/destroot/include")
set(HERMES_FRAMEWORKS_DIR "${HERMES_EXTRACT_DIR}/destroot/Library/Frameworks/macosx")
set(HERMES_FRAMEWORK "${HERMES_FRAMEWORKS_DIR}/hermesvm.framework")

# ── react-native-nitro-modules core (no Android/iOS-specific glue needed) ──
set(NITRO_MODULES_DIR "${CMAKE_SOURCE_DIR}/../../node_modules/react-native-nitro-modules/cpp")
set(NITRO_MODULES_IOS_DIR "${CMAKE_SOURCE_DIR}/../../node_modules/react-native-nitro-modules/ios")
file(GLOB_RECURSE NITRO_MODULES_SOURCES
  "${NITRO_MODULES_DIR}/core/*.cpp"
  "${NITRO_MODULES_DIR}/entrypoint/*.cpp"
  "${NITRO_MODULES_DIR}/jsi/*.cpp"
  "${NITRO_MODULES_DIR}/prototype/*.cpp"
  "${NITRO_MODULES_DIR}/registry/*.cpp"
  "${NITRO_MODULES_DIR}/threading/*.cpp"
  "${NITRO_MODULES_DIR}/utils/*.cpp"
)
# ThreadUtils has no cross-platform impl in cpp/ (platform-specific by design).
# The iOS one is plain C++ + libdispatch (no Objective-C), so it links fine on
# a macOS host too — reused here only to satisfy link-time symbols.
list(APPEND NITRO_MODULES_SOURCES
  "${NITRO_MODULES_IOS_DIR}/platform/ThreadUtils.cpp"
  "${NITRO_MODULES_IOS_DIR}/threading/UIThreadDispatcher.cpp"
)

# nitrogen-generated code (and NitroModules' own headers) always include each
# other as `<NitroModules/X.hpp>` — CocoaPods/Gradle satisfy this by flattening
# all headers into one `NitroModules/` public-headers folder. Reproduce that
# here with a directory of symlinks instead of hardcoding per-file copies.
set(NITRO_MODULES_FLAT_DIR "${CMAKE_BINARY_DIR}/nitro_headers/NitroModules")
file(MAKE_DIRECTORY "${NITRO_MODULES_FLAT_DIR}")
file(GLOB_RECURSE NITRO_MODULES_ALL_HEADERS
  "${NITRO_MODULES_DIR}/*.hpp"
  "${NITRO_MODULES_IOS_DIR}/platform/*.hpp"
  "${NITRO_MODULES_IOS_DIR}/threading/*.hpp"
)
foreach(HEADER ${NITRO_MODULES_ALL_HEADERS})
  get_filename_component(HEADER_NAME "${HEADER}" NAME)
  set(LINK_PATH "${NITRO_MODULES_FLAT_DIR}/${HEADER_NAME}")
  if(NOT EXISTS "${LINK_PATH}")
    file(CREATE_LINK "${HEADER}" "${LINK_PATH}" SYMBOLIC)
  endif()
endforeach()

set(NITRO_MODULES_INCLUDE_DIRS
  "${HERMES_INCLUDE_DIR}"
  "${HERMES_INCLUDE_DIR}/jsi"
  "${CMAKE_BINARY_DIR}/nitro_headers"
  "${NITRO_MODULES_DIR}/core"
  "${NITRO_MODULES_DIR}/entrypoint"
  "${NITRO_MODULES_DIR}/jsi"
  "${NITRO_MODULES_DIR}/prototype"
  "${NITRO_MODULES_DIR}/registry"
  "${NITRO_MODULES_DIR}/threading"
  "${NITRO_MODULES_DIR}/utils"
  "${NITRO_MODULES_DIR}/templates"
  "${NITRO_MODULES_DIR}/platform"
  "${NITRO_MODULES_IOS_DIR}/platform"
  "${NITRO_MODULES_IOS_DIR}/threading"
)

# ── The project's own native core (cpp/database, cpp/query, cpp/sync) ─────
set(PROJECT_CPP_DIR "${CMAKE_SOURCE_DIR}/..")
set(GENERATED_CPP_DIR "${CMAKE_SOURCE_DIR}/../../nitrogen/generated/shared/c++")

set(PROJECT_SOURCES
  "${PROJECT_CPP_DIR}/database/HybridSalveDatabase.cpp"
  "${PROJECT_CPP_DIR}/database/SQLiteConnection.cpp"
  "${PROJECT_CPP_DIR}/database/DatabaseManager.cpp"
  "${PROJECT_CPP_DIR}/database/NativeConfigStore.cpp"
  "${PROJECT_CPP_DIR}/database/MigrationEngine.cpp"
  "${PROJECT_CPP_DIR}/database/SchemaRegistry.cpp"
  "${PROJECT_CPP_DIR}/query/QueryExecutor.cpp"
  "${PROJECT_CPP_DIR}/sync/SyncOrchestrator.cpp"
  "${PROJECT_CPP_DIR}/sync/SyncNativeEntryPoint.cpp"
  "${PROJECT_CPP_DIR}/sync/SyncApplyGuard.cpp"
  "${PROJECT_CPP_DIR}/sync/SyncQueueReader.cpp"
  "${PROJECT_CPP_DIR}/sync/SyncDefinitionStore.cpp"
  "${PROJECT_CPP_DIR}/sync/SyncCursorStore.cpp"
  "${PROJECT_CPP_DIR}/sync/SyncOperationApplier.cpp"
  "${PROJECT_CPP_DIR}/expression/RequestExpressionEvaluator.cpp"
  "${PROJECT_CPP_DIR}/expression/JsonPathExtractor.cpp"
  "${PROJECT_CPP_DIR}/credentials/CredentialProvider.cpp"
  "${PROJECT_CPP_DIR}/http/HttpUrlBuilder.cpp"
  "${PROJECT_CPP_DIR}/http/CredentialHttpCaller.cpp"
  "${PROJECT_CPP_DIR}/http/SyncHttpCaller.cpp"
  "${PROJECT_CPP_DIR}/third_party/sqlite3/sqlite3.c"
  "${GENERATED_CPP_DIR}/HybridSalveDatabaseSpec.cpp"
)

# Test files mirror cpp/'s own layout: cpp/database/* -> tests/database/,
# cpp/query/* -> tests/query/, cpp/sync/* -> tests/sync/. Shared harness code
# (Hermes+Nitro bootstrap, test Dispatcher, platform stub) lives in support/.
file(GLOB_RECURSE TEST_SOURCES
  "${CMAKE_SOURCE_DIR}/database/*.cpp"
  "${CMAKE_SOURCE_DIR}/query/*.cpp"
  "${CMAKE_SOURCE_DIR}/sync/*.cpp"
  "${CMAKE_SOURCE_DIR}/expression/*.cpp"
  "${CMAKE_SOURCE_DIR}/credentials/*.cpp"
  "${CMAKE_SOURCE_DIR}/http/*.cpp"
)

# ── Real test suite: Catch2 + HybridSalveDatabase through real JSI ─────────
add_executable(salvedb_tests
  ${TEST_SOURCES}
  support/platform_test.cpp
  ${NITRO_MODULES_SOURCES}
  ${PROJECT_SOURCES}
)
target_include_directories(salvedb_tests PRIVATE
  ${NITRO_MODULES_INCLUDE_DIRS}
  "${CMAKE_SOURCE_DIR}/support"
  "${PROJECT_CPP_DIR}/database"
  "${PROJECT_CPP_DIR}/platform"
  "${PROJECT_CPP_DIR}/query"
  "${PROJECT_CPP_DIR}/sync"
  "${PROJECT_CPP_DIR}/expression"
  "${PROJECT_CPP_DIR}/credentials"
  "${PROJECT_CPP_DIR}/http"
  "${PROJECT_CPP_DIR}/third_party/sqlite3"
  "${GENERATED_CPP_DIR}"
)
target_compile_definitions(salvedb_tests PRIVATE SQLITE_ENABLE_COLUMN_METADATA=1)
target_link_libraries(salvedb_tests PRIVATE Catch2::Catch2WithMain)
target_link_options(salvedb_tests PRIVATE "-F${HERMES_FRAMEWORKS_DIR}" "-framework" "hermesvm")
set_target_properties(salvedb_tests PROPERTIES
  BUILD_RPATH "${HERMES_FRAMEWORKS_DIR}"
)

include(CTest)
include("${catch2_SOURCE_DIR}/extras/Catch.cmake")
catch_discover_tests(salvedb_tests)
