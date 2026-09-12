#!/bin/sh
set -u
sudo -n docker run --rm --platform linux/amd64 --network none --read-only \
  --user 1000:1000 --cpus 4 --memory 2g \
  --tmpfs /tmp:rw,nosuid,nodev,size=1073741824 z8-core24-icc-quality:local \
  > .desktop-local/core24-icc/isolated-quality.json \
  2> .desktop-local/core24-icc/isolated-quality.stderr
z8_quality_exit=$?
printf '%s\n' "$z8_quality_exit" > .desktop-local/core24-icc/isolated-quality-exit.txt
exit "$z8_quality_exit"
