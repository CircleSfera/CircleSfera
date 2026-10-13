#!/usr/bin/env python3
"""Take one address out of an nginx site file written by hand.

Used when an environment gets its own site: the address must stop being
answered by the older site, which sends it to production.

  release-address.py <file> <address>            print the file without it
  release-address.py <file> <address> --check    exit 0 if the file names it

A server block that answers only that address is removed whole. A server
block that answers it among others keeps the others. Nothing else in the
file is touched: not the comments, not the other blocks, not a certificate.
The file itself is never written; the caller decides what to do with the
output.
"""
import re
import sys


def top_level_blocks(text):
    """Yield (start, end) of every top-level `server { ... }` block."""
    depth = 0
    start = None
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "#":
            # A comment runs to the end of its line; braces in it do not count.
            while i < n and text[i] != "\n":
                i += 1
            continue
        if ch in "\"'":
            quote = ch
            i += 1
            while i < n and text[i] != quote:
                i += 2 if text[i] == "\\" else 1
        elif ch == "{":
            if depth == 0:
                head = text[:i].rstrip()
                if re.search(r"(^|[\s;}])server$", head):
                    start = len(head) - len("server")
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                yield start, i + 1
                start = None
        i += 1


NAMES = re.compile(r"^([ \t]*)server_name\b([^;]*);", re.M)


def release(text, address):
    out = []
    last = 0
    for start, end in top_level_blocks(text):
        block = text[start:end]
        names = [n for m in NAMES.finditer(block) for n in m.group(2).split()]
        if address not in names:
            continue
        out.append(text[last:start])
        if all(name == address for name in names):
            # The block answers nothing else: it goes, with its line break.
            last = end + 1 if text[end : end + 1] == "\n" else end
            continue

        def without(match):
            kept = [n for n in match.group(2).split() if n != address]
            if not kept:
                return ""
            return f"{match.group(1)}server_name {' '.join(kept)};"

        out.append(NAMES.sub(without, block))
        last = end
    out.append(text[last:])
    return "".join(out)


def main():
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    path, address = sys.argv[1], sys.argv[2]
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    result = release(text, address)
    if len(sys.argv) == 4:
        if sys.argv[3] != "--check":
            sys.exit(__doc__)
        sys.exit(0 if result != text else 1)
    sys.stdout.write(result)


if __name__ == "__main__":
    main()
