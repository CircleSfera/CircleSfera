#!/usr/bin/env bash
# Moves every image pinned by digest to the digest its tag serves today, so
# that pinned images keep getting the fixes of their maintainers. The tag
# never changes, only the digest: a major version moves by hand.
#
# Files outside .github/workflows (the Dockerfiles and the Compose files) are
# changed in place. Images pinned inside the workflows are only reported:
# the token of a scheduled workflow may not change workflow files. The copies
# the workflows read from this repository's registry (…/mirror/<name>:<tag>)
# are checked against the source listed in ops-copy-pinned-images.yml.
#
# Writes a Markdown report to the file given (one row per image that moved),
# and prints what it does. Needs skopeo. Run from the repository root.
#
# Usage: refresh-image-digests.sh <report file>
set -euo pipefail
# The backticks in the report rows are Markdown, not commands.
# shellcheck disable=SC2016

report=${1:?Usage: refresh-image-digests.sh <report file>}
mirror=ghcr.io/circlesfera/circlesfera/mirror
copies=.github/workflows/ops-copy-pinned-images.yml

files=$(git ls-files | grep -E '(^|/)Dockerfile[^/]*$|(^|/)docker-compose[^/]*\.ya?ml$|^\.github/workflows/[^/]+\.ya?ml$')
# shellcheck disable=SC2086
pins=$(grep -ohE '[A-Za-z0-9./_-]+:[A-Za-z0-9._-]+@sha256:[0-9a-f]{64}' $files | sort -u)

# What a tag serves now, as the digest of its top manifest (every platform).
served() {
  local manifest
  manifest=$(skopeo inspect --raw --retry-times 2 "docker://$1") || return 1
  printf '%s' "$manifest" | sha256sum | sed 's/^/sha256:/; s/ .*//'
}

: > "$report"
moved=0
in_workflows=0
unreachable=0
seen=" "
for pin in $pins; do
  image=${pin%@*}
  old=${pin#*@}
  lookup=$image
  if [[ $image == "$mirror/"* ]]; then
    # name:tag|source|digest, in the list of copies.
    name=${image#"$mirror/"}
    source=$(grep -E "^[[:space:]]*$name\|" "$copies" | head -1 | cut -d'|' -f2 | xargs || true)
    if [ -z "$source" ]; then
      echo "No source listed for $image in $copies"
      unreachable=$((unreachable + 1))
      continue
    fi
    lookup="$source:${name#*:}"
  fi
  if ! new=$(served "$lookup"); then
    echo "Could not read $lookup"
    unreachable=$((unreachable + 1))
    continue
  fi
  if [ "$new" = "$old" ]; then
    echo "Current: $image"
    continue
  fi
  # A copy and its source share their digest: one row for both.
  [[ $seen == *" $old "* ]] && continue
  seen="$seen$old "

  echo "Moved: $image ${old:7:12} -> ${new:7:12}"
  # shellcheck disable=SC2086
  holders=$(grep -lF "$old" $files || true)
  outside=$(printf '%s\n' "$holders" | grep -v '^\.github/workflows/' || true)
  inside=$(printf '%s\n' "$holders" | grep '^\.github/workflows/' || true)
  for file in $outside; do
    sed -i "s/$old/$new/g" "$file"
  done
  if [ -n "$outside" ]; then
    moved=$((moved + 1))
    printf '| `%s` | `%s` | `%s` | %s |\n' "$lookup" "${old:7:12}" "${new:7:12}" \
      "$(printf '%s' "$outside" | paste -sd, - | sed 's/,/, /g')" >> "$report"
  fi
  if [ -n "$inside" ]; then
    in_workflows=$((in_workflows + 1))
    printf '| `%s` | `%s` | `%s` | %s (workflows: by hand) |\n' "$image" "${old:7:12}" "${new:7:12}" \
      "$(printf '%s' "$inside" | paste -sd, - | sed 's/,/, /g')" >> "$report"
  fi
done

echo "Moved in place: $moved. Left in workflows: $in_workflows. Not read: $unreachable."
{
  echo "moved=$moved"
  echo "in_workflows=$in_workflows"
  echo "unreachable=$unreachable"
} >> "${GITHUB_OUTPUT:-/dev/null}"
