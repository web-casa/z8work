#!/usr/bin/env bash
# Development cross-build only; no Windows execution, engine distribution or MSIX.
set -euo pipefail
cd "$(dirname "$0")/../../.."
if [[ $# != 1 || "$1" != /* ]]; then
  echo "Usage: bash packaging/desktop/windows/build-cross.sh ABSOLUTE_NEW_OUTPUT" >&2
  exit 2
fi
output="$1"
mkdir "$output"
for tool in cargo cargo-xwin llvm-rc clang lld-link node bun; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 1; }
done
export XWIN_ARCH=x86_64
export CARGO_INCREMENTAL=0
node scripts/desktop-windows-inputs.mjs --output "$output/inputs.json"
bun run desktop:build > "$output/frontend.log" 2>&1
cargo xwin build --locked --manifest-path src-tauri/Cargo.toml -p z8-desktop \
  --config packaging/desktop/windows/cargo-config.toml \
  --target-dir src-tauri/target \
  --release --target x86_64-pc-windows-msvc --no-default-features \
  --features packaged-engines,custom-protocol > "$output/build.log" 2>&1
cargo xwin test --locked --manifest-path src-tauri/Cargo.toml -p z8-native \
  --config packaging/desktop/windows/cargo-config.toml \
  --target-dir src-tauri/target \
  --release --target x86_64-pc-windows-msvc --no-default-features --no-run \
  --message-format=json > "$output/native-tests.jsonl" 2> "$output/native-tests.log"
node scripts/desktop-windows-inputs.mjs --verify "$output/inputs.json"
mkdir "$output/application"
cp src-tauri/target/x86_64-pc-windows-msvc/release/z8-desktop.exe "$output/application/"
node scripts/desktop-windows-check.mjs --root "$output/application" --output "$output/inspection"
{
  rustc --version
  cargo xwin --version
  clang --version
  node --version
  bun --version
  git rev-parse HEAD
} > "$output/toolchain.txt"
