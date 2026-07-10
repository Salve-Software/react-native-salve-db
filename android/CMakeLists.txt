project(SalveDb)
cmake_minimum_required(VERSION 3.9.0)

set (PACKAGE_NAME SalveDb)
set (CMAKE_VERBOSE_MAKEFILE ON)
set (CMAKE_CXX_STANDARD 20)

# Enable Raw Props parsing in react-native (for Nitro Views)
add_compile_options(-DRN_SERIALIZABLE_STATE=1)

# Define C++ library and add all sources
add_library(${PACKAGE_NAME} SHARED
	../packages/sqlite3/sqlite3.c
	src/main/cpp/cpp-adapter.cpp
	src/main/cpp/platform_android.cpp
	../cpp/database/HybridSalveDatabase.cpp
	../cpp/database/SQLiteConnection.cpp
	../cpp/database/DatabaseManager.cpp
	../cpp/database/MigrationEngine.cpp
	../cpp/query/HybridSalveQuery.cpp
	../cpp/sync/HybridSalveSync.cpp
)

# Add Nitrogen specs :)
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/SalveDb+autolinking.cmake)

# Set up local includes
include_directories(
        "src/main/cpp"
        "../cpp"
        "../cpp/database"
        "../cpp/query"
        "../cpp/sync"
        "../packages/sqlite3"
)

find_library(LOG_LIB log)

# Link all libraries together
target_link_libraries(
        ${PACKAGE_NAME}
        ${LOG_LIB}
        android
)
