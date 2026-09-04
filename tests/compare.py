#!/usr/bin/env python3
"""Compare native and browser harness records. Existing native issues must also match."""
import json
import pathlib
import sys


def read(path):
    text = pathlib.Path(path).read_text()
    # An old native Java runtime can print CodeCache diagnostics before main().
    start = text.find('{"suite"')
    if start < 0:
        start = text.find('{')
    return json.loads(text[start:])


if len(sys.argv) != 3:
    raise SystemExit('Usage: python3 compare.py native-suite.json browser-suite.json')
expected = read(sys.argv[1])
actual = read(sys.argv[2])
before, after = expected['records'], actual['records']
errors = []
for key in sorted(set(before) | set(after)):
    if before.get(key) != after.get(key):
        errors.append(key)
        print(key)
        print('  native: ', before.get(key, 'MISSING'))
        print('  browser:', after.get(key, 'MISSING'))
print(f'{len(before)} native records; {len(after)} browser records; {len(errors)} differences')
print(f'Native baseline: {expected["passed"]} passed; {expected["originalIssues"]} original issues')
raise SystemExit(bool(errors))
