project(SalveDb)
cmake_minimum_required(VERSION 3.9.0)

set (PACKAGE_NAME SalveDb)
set (CMAKE_VERBOSE_MAKEFILE ON)
set (CMAKE_CXX_STANDARD 20)

# Enable Raw Props parsing in react-native (for Nitro Views)
add_compile_options(-DRN_SERIALIZABLE_STATE=1)

# Define C++ library and add all sources
add_library(${PACKAGE_NAME} SHARED
	../cpp/third_party/sqlite3/sqlite3.c
	src/main/cpp/cpp-adapter.cpp
	src/main/cpp/platform_android.cpp
	src/main/cpp/JniSupport.cpp
	src/main/cpp/platform_android_http.cpp
	../cpp/http/HttpUrlBuilder.cpp
	../cpp/http/CredentialHttpCaller.cpp
	../cpp/database/HybridSalveDatabase.cpp
	../cpp/database/SQLiteConnection.cpp
	../cpp/database/DatabaseManager.cpp
	../cpp/database/MigrationEngine.cpp
	../cpp/database/SchemaRegistry.cpp
	../cpp/query/QueryExecutor.cpp
	../cpp/sync/SyncOrchestrator.cpp
	../cpp/sync/SyncNativeEntryPoint.cpp
	../cpp/sync/SyncApplyGuard.cpp
	../cpp/sync/SyncQueueReader.cpp
	../cpp/sync/SyncDefinitionStore.cpp
	../cpp/sync/SyncCursorStore.cpp
	../cpp/sync/SyncOperationApplier.cpp
	../cpp/expression/RequestExpressionEvaluator.cpp
	../cpp/expression/JsonPathExtractor.cpp
	../cpp/credentials/CredentialProvider.cpp
	../cpp/http/SyncHttpCaller.cpp
)

# Needed for sqlite3_column_table_name/origin_name, used to coerce boolean columns on read.
# target_compile_definitions (not add_compile_definitions, which needs CMake >= 3.12)
# keeps this working under the cmake_minimum_required(3.9.0) declared above.
target_compile_definitions(${PACKAGE_NAME} PRIVATE SQLITE_ENABLE_COLUMN_METADATA=1)

# Add Nitrogen specs :)
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/SalveDb+autolinking.cmake)

# Set up local includes
include_directories(
        "src/main/cpp"
        "../cpp"
        "../cpp/database"
        "../cpp/platform"
        "../cpp/query"
        "../cpp/sync"
        "../cpp/expression"
        "../cpp/credentials"
        "../cpp/http"
        "../cpp/third_party/sqlite3"
)

find_library(LOG_LIB log)

# Link all libraries together
target_link_libraries(
        ${PACKAGE_NAME}
        ${LOG_LIB}
        android
)
