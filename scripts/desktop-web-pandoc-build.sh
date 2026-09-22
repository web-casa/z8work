#!/bin/bash
# Build the audited Pandoc context. The caller enforces Docker --network none.
set -euo pipefail

mode=${1:---network-disabled}
if [[ "$mode" != --network-disabled && "$mode" != --online-bootstrap ]]; then
  echo 'usage: desktop-web-pandoc-build.sh [--network-disabled|--online-bootstrap]' >&2
  exit 2
fi
if [[ "$mode" == --network-disabled && "${Z8_PANDOC_NETWORK_DISABLED:-}" != 1 ]]; then
  echo 'offline verification requires Docker --network none and Z8_PANDOC_NETWORK_DISABLED=1' >&2
  exit 2
fi
work=/work
prefix=$work/toolchain
context=$work/context
export PATH="$prefix/wasm32-wasi-ghc/bin:$prefix/wasi-sdk/bin:$prefix/nodejs/bin:$prefix/binaryen/bin:$PATH"
export CABAL_DIR="$work/cabal-home"
export CABAL_CONFIG="$context/cabal.config"
export SOURCE_DATE_EPOCH=1731659142
export TZ=UTC
export LC_ALL=C.UTF-8
export AR="$prefix/wasi-sdk/bin/llvm-ar"
export CC="$prefix/wasi-sdk/bin/wasm32-wasi-clang"
export CC_FOR_BUILD=cc
export CXX="$prefix/wasi-sdk/bin/wasm32-wasi-clang++"
export LD="$prefix/wasi-sdk/bin/wasm-ld"
export NM="$prefix/wasi-sdk/bin/llvm-nm"
export OBJCOPY="$prefix/wasi-sdk/bin/llvm-objcopy"
export OBJDUMP="$prefix/wasi-sdk/bin/llvm-objdump"
export RANLIB="$prefix/wasi-sdk/bin/llvm-ranlib"
export SIZE="$prefix/wasi-sdk/bin/llvm-size"
export STRINGS="$prefix/wasi-sdk/bin/llvm-strings"
export STRIP="$prefix/wasi-sdk/bin/llvm-strip"
export LLC=/bin/false
export OPT=/bin/false

mkdir -p "$CABAL_DIR" "$work/output"
cabal="$prefix/cabal/bin/cabal"
common=(
  --with-compiler="$prefix/wasm32-wasi-ghc/bin/wasm32-wasi-ghc"
  --with-hc-pkg="$prefix/wasm32-wasi-ghc/bin/wasm32-wasi-ghc-pkg"
  --with-hsc2hs="$prefix/wasm32-wasi-ghc/bin/wasm32-wasi-hsc2hs"
  --ghc-options=-fobject-determinism
)
cd "$context/source"
"$cabal" "${common[@]}" build pandoc-cli:exe:pandoc -j1 \
  --builddir="$work/build"
binary=$("$cabal" "${common[@]}" list-bin pandoc-cli:exe:pandoc \
  --builddir="$work/build")
test "$(dd if="$binary" bs=4 count=1 status=none | od -An -tx1 | tr -d ' \n')" = 0061736d
cp "$binary" "$work/output/pandoc.raw.wasm"
"$prefix/binaryen/bin/wasm-opt" "$work/output/pandoc.raw.wasm" -Oz \
  --enable-bulk-memory --enable-nontrapping-float-to-int \
  --enable-sign-ext --enable-multivalue --enable-reference-types \
  -o "$work/output/pandoc.wasm"
test "$(dd if="$work/output/pandoc.wasm" bs=4 count=1 status=none | od -An -tx1 | tr -d ' \n')" = 0061736d
sha256sum "$work/output/pandoc.raw.wasm"
sha256sum "$work/output/pandoc.wasm"
