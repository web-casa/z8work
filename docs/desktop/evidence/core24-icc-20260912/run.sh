#!/bin/sh
set -eu
cd /work
git config --global --add safe.directory /work
export RUSTUP_TOOLCHAIN=1.96.0-x86_64-unknown-linux-gnu
export CARGO_NET_OFFLINE=true
node scripts/desktop-windows-inputs.mjs --output .desktop-local/core24-icc-inputs.json
sh packaging/desktop/linux/build-core24.sh
node scripts/desktop-windows-inputs.mjs --verify .desktop-local/core24-icc-inputs.json
