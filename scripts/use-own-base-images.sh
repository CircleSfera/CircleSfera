#!/usr/bin/env bash
# Points the given Dockerfiles at the repository's own copy of their base
# images, copying any base image that is not there yet. The deploys run it
# before building: the public mirror the Dockerfiles name stops serving
# downloads for hours once its allowance is used up, and fails the deploy.
#
# Only the working copy of the build machine is changed. The Dockerfiles in
# the repository keep naming the public mirror, so local builds need no
# sign-in and Dependabot keeps updating their digests. After a digest bump the
# new image is copied here once, and read from the copy after that. Each copy
# keeps every platform and must have the same digest. An image that cannot be
# copied keeps the public mirror's name, as before this script, and the run
# says so; "Ops — copy pinned images" copies it by hand.
#
# Usage: use-own-base-images.sh <target registry prefix> <Dockerfile>...
# Needs skopeo, signed in to the target registry.
set -euo pipefail

target=$1
shift
source=public.ecr.aws/docker/library

refs=$(grep -h "^FROM $source/" "$@" | awk '{print $2}' | sed "s|^$source/||" | sort -u)
if [ -z "$refs" ]; then
  echo "No base image from $source in: $*"
  exit 1
fi

copy_digest() {
  skopeo inspect --raw "docker://$target/$1@$2" 2>/dev/null | sha256sum | cut -d' ' -f1
}

for ref in $refs; do
  name=${ref%@*}
  digest=${ref#*@}
  repository=${name%%:*}
  if [ "sha256:$(copy_digest "$repository" "$digest")" != "$digest" ]; then
    # The same digest is the same image wherever it is read: when the mirror
    # the Dockerfiles name refuses, try Google's mirror of Docker Hub, then
    # Docker Hub itself.
    for from in "$source" mirror.gcr.io/library docker.io/library; do
      echo "Copying $from/$name@$digest to $target/$name"
      if skopeo copy --all --preserve-digests --retry-times 2 \
        "docker://$from/$repository@$digest" "docker://$target/$name"; then
        break
      fi
    done
  fi
  if [ "sha256:$(copy_digest "$repository" "$digest")" = "$digest" ]; then
    echo "From our copy: $name@$digest"
    sed -i "s|^FROM $source/$name@$digest|FROM $target/$name@$digest|" "$@"
  else
    echo "::warning::No copy of $name@$digest; it is read from $source"
  fi
done

grep -h '^FROM ' "$@"
