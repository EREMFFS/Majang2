#!/bin/bash
# Headless checks (Node 18+). Browser checks need Playwright + a local server: see README.
set -e
cd "$(dirname "$0")/.."
node tests/unit.js
node tests/roles_test.js
node tests/stress.js ${1:-8} | head -1
python3 tests/audio_levels.py
