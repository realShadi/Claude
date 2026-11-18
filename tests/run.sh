#!/bin/bash
# Build the single-file demo from site/ and run every test against it.
#   cd tests && npm install && npx playwright install chromium && npm test
set -u
cd "$(dirname "$0")"
mkdir -p .build
python3 ../tools/build-demo.py .build/page.html > /dev/null && python3 variant.py .build/page.html .build/page-opt.html > /dev/null || exit 1
fail=0
run() { echo "== $*"; node "$@" 2>&1 | grep -E "^FAIL|^VIOLATION|failed of|violation rules|pairs|ERRORS|Error" ; [ "${PIPESTATUS[0]}" -ne 0 ] && fail=1; }
run contrast.test.js
run legal.test.js
run consent.test.js
run keyboard.test.js
run injection.test.js
run embed.test.js
run axe.test.js both both
[ $fail -eq 0 ] && echo "ALL PASSED" || echo "SOMETHING FAILED"
exit $fail
