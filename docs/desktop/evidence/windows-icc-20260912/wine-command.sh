#!/bin/sh
# Command record from the repository root. Use a fresh report directory on replay.
sudo -n docker run --rm --platform linux/amd64 --network none --cap-drop ALL \
  --user "$(id -u):$(id -g)" --memory 4g --cpus 4 \
  -e LANG=C.UTF-8 -e HOME=/tmp -e WINEPREFIX=/work/wine-prefix -e WINEDEBUG=-all \
  -v "$PWD:/repo:ro" -v "$PWD/.desktop-local/windows-icc:/work" \
  z8-phase11-wine:local /opt/node/bin/node \
  /repo/scripts/desktop-windows-engines-check.mjs \
  --root /work/engines-final --output /work/wine-extended --runtime wine --full
