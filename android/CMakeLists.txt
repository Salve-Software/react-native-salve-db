project(SalveDb)
cmake_minimum_required(VERSION 3.9.0)

set (PACKAGE_NAME SalveDb)
set (CMAKE_VERBOSE_MAKEFILE ON)
set (CMAKE_CXX_STANDARD 20)

# Enable Raw Props parsing in react-native (for Nitro Views)
add_compile_options(-DRN_SERIALIZABLE_STATE=1)
# Needed for sqlite3_column_table_name/origin_name, used to coerce boolean columns on read.
add_compile_definitions(SQLITE_ENABLE_COLUMN_METADATA=1)

# Define C++ library and add all sources
add_library(${PACKAGE_NAME} SHARED
	../cpp/third_party/sqlite3/sqlite3.c
	src/main/cpp/cpp-adapter.cpp
	src/main/cpp/platform_android.cpp
	../cpp/database/HybridSalveDatabase.cpp
	../cpp/database/SQLiteConnection.cpp
	../cpp/database/DatabaseManager.cpp
	../cpp/database/MigrationEngine.cpp
	../cpp/database/SchemaRegistry.cpp
	../cpp/query/QueryExecutor.cpp
	../cpp/sync/SyncOrchestrator.cpp
	../cpp/sync/SyncApplyGuard.cpp
)

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
        "../cpp/third_party/sqlite3"
)

find_library(LOG_LIB log)

# Link all libraries together
target_link_libraries(
        ${PACKAGE_NAME}
        ${LOG_LIB}
        android
)
