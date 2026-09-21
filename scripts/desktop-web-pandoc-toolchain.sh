#!/bin/bash
# Install the locked historical wasm32-wasi GHC toolchain from local archives.
set -euo pipefail

work=/work
context=$work/context
prefix=$work/toolchain
test -d "$context/inputs"
test ! -e "$prefix"
(cd "$context" && sha256sum -c toolchain.sha256)

mkdir -p "$prefix/wasi-sdk" "$prefix/nodejs" "$prefix/binaryen" \
  "$prefix/cabal/bin" "$work/setup"
tar xzf "$context/inputs/wasi-sdk.tar.gz" -C "$prefix/wasi-sdk" --strip-components=1
unzip -q "$context/inputs/libffi-wasm.zip" -d "$work/setup/libffi"
cp -a "$work/setup/libffi/out/libffi-wasm/include/." \
  "$prefix/wasi-sdk/share/wasi-sysroot/include/wasm32-wasi"
cp -a "$work/setup/libffi/out/libffi-wasm/lib/." \
  "$prefix/wasi-sdk/share/wasi-sysroot/lib/wasm32-wasi"
tar xJf "$context/inputs/node.tar.xz" -C "$prefix/nodejs" --strip-components=1
tar xzf "$context/inputs/binaryen.tar.gz" -C "$prefix/binaryen" --strip-components=1
tar xJf "$context/inputs/cabal.tar.xz" -C "$prefix/cabal/bin" cabal
tar xJf "$context/inputs/ghc-9.12.tar.xz" -C "$work/setup"
ghc_dir=$(find "$work/setup" -maxdepth 1 -type d -name 'ghc-*wasm32-wasi' -print -quit)
test -n "$ghc_dir"

export PATH="$prefix/nodejs/bin:$prefix/wasi-sdk/bin:$PATH"
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
export CONF_CC_OPTS_STAGE2='-fno-strict-aliasing -Wno-error=int-conversion -Oz -msimd128 -mnontrapping-fptoint -msign-ext -mbulk-memory -mmutable-globals -mmultivalue -mreference-types'
export CONF_CXX_OPTS_STAGE2='-fno-exceptions -fno-strict-aliasing -Wno-error=int-conversion -Oz -msimd128 -mnontrapping-fptoint -msign-ext -mbulk-memory -mmutable-globals -mmultivalue -mreference-types'
export CONF_GCC_LINKER_OPTS_STAGE2='-Wl,--error-limit=0,--keep-section=ghc_wasm_jsffi,--keep-section=target_features,--stack-first,--strip-debug '

cd "$ghc_dir"
./configure --host=x86_64-linux --target=wasm32-wasi --with-intree-gmp \
  --with-system-libffi --prefix="$prefix/wasm32-wasi-ghc"
make -j1 install

"$prefix/wasm32-wasi-ghc/bin/wasm32-wasi-ghc" --numeric-version | \
  grep -Fx '9.12.0.20241115'
"$prefix/cabal/bin/cabal" --numeric-version | grep -Fx '3.14.0.0'
"$prefix/binaryen/bin/wasm-opt" --version | grep -Fx 'wasm-opt version 119 (version_119)'
