#!/usr/bin/env bash
# Configures (if needed), builds, and runs the native C++ test suite
# (salvedb_tests). Runs in-process against a real Hermes runtime — no
# simulator/emulator, no Metro. Extra args are passed through to Catch2
# (e.g. `-s` for verbose output, `[tag]` to filter, `--list-tests`).
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d build ]; then
  cmake -S . -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
fi

cmake --build build --target salvedb_tests
exec ./build/salvedb_tests "$@"
