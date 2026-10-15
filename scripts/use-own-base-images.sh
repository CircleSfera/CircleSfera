#!/usr/bin/env bash
# Points the given Dockerfiles at the repository's own copy of their base
# images, copying any base image that is not there yet. The deploys run it
# before building: the public mirror the Dockerfiles name stops serving
# downloads for hours once its allowance is used up, and fails the deploy.
#
# Only the working copy of the build machine is changed. The Dockerfiles in
# the repository keep naming the public mirror, so local builds need no
# sign-in and Dependabot keeps updating their digests. After a digest bump the
# new image is read from the public mirror once, here, and from the copy after
# that. Each copy keeps every platform and must have the same digest.
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

for ref in $refs; do
  name=${ref%@*}
  digest=${ref#*@}
  repository=${name%%:*}
  if skopeo inspect --raw "docker://$target/$repository@$digest" >/dev/null 2>&1; then
    echo "Already copied: $name@$digest"
  else
    # The same digest is the same image wherever it is read: when the mirror
    # the Dockerfiles name refuses, try Google's mirror of Docker Hub, then
    # Docker Hub itself.
    copied_from=""
    for from in "$source" mirror.gcr.io/library docker.io/library; do
      echo "Copying $from/$name@$digest to $target/$name"
      if skopeo copy --all --preserve-digests --retry-times 2 \
        "docker://$from/$repository@$digest" "docker://$target/$name"; then
        copied_from=$from
        break
      fi
    done
    if [ -z "$copied_from" ]; then
      echo "No source served $name@$digest"
      exit 1
    fi
  fi
  copied="sha256:$(skopeo inspect --raw "docker://$target/$repository@$digest" | sha256sum | cut -d' ' -f1)"
  if [ "$copied" != "$digest" ]; then
    echo "The copy of $name has digest $copied, expected $digest"
    exit 1
  fi
done

sed -i "s|^FROM $source/|FROM $target/|" "$@"
grep -h '^FROM ' "$@"
