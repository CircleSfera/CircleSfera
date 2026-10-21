#!/usr/bin/env bash
# Chooses where the image builds read each base image of the given
# Dockerfiles from. The deploys run it before building: the public mirror the
# Dockerfiles name stops serving downloads for hours once its allowance is
# used up ("toomanyrequests"), and that failed whole deploys.
#
# For each base image, at its pinned digest:
#   1. the repository's own copy, made here when it is not there yet;
#   2. otherwise the first public source that serves that same digest: the
#      mirror the Dockerfiles name, Google's mirror of Docker Hub, Docker Hub.
# The digest is the image, so every choice builds from the same bytes.
#
# Only the working copy of the build machine is changed. The Dockerfiles in
# the repository keep naming the public mirror, so local builds need no
# sign-in and the weekly Image digests workflow keeps their digests current.
#
# Usage: use-own-base-images.sh <target registry prefix> <Dockerfile>...
# Needs docker buildx and skopeo, both signed in to the target registry.
set -euo pipefail

target=$1
shift
source=public.ecr.aws/docker/library
sources="$source mirror.gcr.io/library docker.io/library"

refs=$(grep -h "^FROM $source/" "$@" | awk '{print $2}' | sed "s|^$source/||" | sort -u)
if [ -z "$refs" ]; then
  echo "No base image from $source in: $*"
  exit 1
fi

# The digest of what an address serves for <repository>@<digest>, or nothing.
served_digest() {
  local manifest
  manifest=$(skopeo inspect --raw --retry-times 1 "docker://$1/$2@$3" 2>/dev/null) || return 0
  printf '%s' "$manifest" | sha256sum | sed 's/^/sha256:/; s/ .*//'
}

for ref in $refs; do
  name=${ref%@*}
  digest=${ref#*@}
  repository=${name%%:*}
  chosen=""

  if [ "$(served_digest "$target" "$repository" "$digest")" != "$digest" ]; then
    for from in $sources; do
      echo "Copying $from/$name@$digest to $target/$name"
      if docker buildx imagetools create --tag "$target/$name" "$from/$repository@$digest"; then
        break
      fi
    done
  fi
  if [ "$(served_digest "$target" "$repository" "$digest")" = "$digest" ]; then
    chosen=$target
  else
    echo "::warning::No copy of $name@$digest in $target; reading it from a public source"
    for from in $sources; do
      if [ "$(served_digest "$from" "$repository" "$digest")" = "$digest" ]; then
        chosen=$from
        break
      fi
    done
  fi

  if [ -z "$chosen" ]; then
    echo "::warning::No source serves $name@$digest right now; the build reads it from $source"
    continue
  fi
  echo "Base image $name@$digest from $chosen"
  sed -i "s|^FROM $source/$name@$digest|FROM $chosen/$name@$digest|" "$@"
done

grep -h '^FROM ' "$@"
