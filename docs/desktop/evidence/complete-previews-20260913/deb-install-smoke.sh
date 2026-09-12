#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=30 update
apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=30 install -y --no-install-recommends /tmp/z8.deb
arch=$(dpkg --print-architecture)
printf '%s  %s\n' "$EXPECTED_APP_SHA" /usr/bin/z8-desktop | sha256sum --check --strict
runuser -u nobody -- /usr/bin/z8-desktop --build-info
engines='/usr/lib/Z8.Work Desktop Dev/engines'
case "$arch" in arm64) loader=ld-linux-aarch64.so.1;; amd64) loader=ld-linux-x86-64.so.2;; *) exit 1;; esac
runuser -u nobody -- "$engines/lib/$loader" --library-path "$engines/lib" "$engines/validation/bundle-check" "$engines" --pdf-color
apt-get remove -y z8-work
test ! -e /usr/bin/z8-desktop
test ! -e "$engines"
test ! -e /usr/share/applications/work.z8.desktop.m0.desktop
printf 'INSTALL_SMOKE_PASSED %s\n' "$arch"
