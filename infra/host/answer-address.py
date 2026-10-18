#!/usr/bin/env python3
"""Make an nginx site file written by hand answer one more address.

Used when a production address is answered only because its site happened to
be the first one nginx loaded: once another site comes first, the address
reaches that site instead.

  answer-address.py <file> <anchor> <address>            print the file with it
  answer-address.py <file> <anchor> <address> --check    exit 0 if it is missing

Every server block that answers <anchor> gets <address> added to its first
server_name; a block that already answers it is left alone. Nothing else in
the file is touched. The file itself is never written; the caller decides
what to do with the output.
"""
import importlib.util
import os
import sys

# The reading of server blocks is the one release-address.py uses.
_spec = importlib.util.spec_from_file_location(
    "release_address",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "release-address.py"),
)
_release = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_release)
NAMES = _release.NAMES
top_level_blocks = _release.top_level_blocks


def answer(text, anchor, address):
    out = []
    last = 0
    for start, end in top_level_blocks(text):
        block = text[start:end]
        names = [n for m in NAMES.finditer(block) for n in m.group(2).split()]
        if anchor not in names or address in names:
            continue

        def plus(match):
            return f"{match.group(1)}server_name{match.group(2).rstrip()} {address};"

        out.append(text[last:start])
        out.append(NAMES.sub(plus, block, count=1))
        last = end
    out.append(text[last:])
    return "".join(out)


def main():
    if len(sys.argv) not in (4, 5):
        sys.exit(__doc__)
    path, anchor, address = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    result = answer(text, anchor, address)
    if len(sys.argv) == 5:
        if sys.argv[4] != "--check":
            sys.exit(__doc__)
        sys.exit(0 if result != text else 1)
    sys.stdout.write(result)


if __name__ == "__main__":
    main()
