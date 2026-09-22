#!/bin/bash
# Invoked inside a dedicated xvfb-run + dbus-run-session by the CI verifier.
set -euo pipefail
: "${Z8_GUI_SESSION_ROOT:?Set a new dedicated session directory}"
: "${DISPLAY:?Run inside xvfb-run}"
: "${DBUS_SESSION_BUS_ADDRESS:?Run inside dbus-run-session}"
export XDG_CURRENT_DESKTOP=GNOME
export XDG_RUNTIME_DIR="$Z8_GUI_SESSION_ROOT/runtime"
export XDG_CONFIG_HOME="$Z8_GUI_SESSION_ROOT/portal-config"
export XDG_DATA_HOME="$Z8_GUI_SESSION_ROOT/portal-data"
export XDG_CACHE_HOME="$Z8_GUI_SESSION_ROOT/portal-cache"
mkdir -m 700 "$XDG_RUNTIME_DIR"
mkdir -p "$XDG_CONFIG_HOME/xdg-desktop-portal"
printf '[preferred]\ndefault=gtk\n' > "$XDG_CONFIG_HOME/xdg-desktop-portal/portals.conf"
/usr/libexec/xdg-desktop-portal-gtk > "$Z8_GUI_SESSION_ROOT/gtk.log" 2>&1 &
gtk_pid=$!
/usr/libexec/xdg-desktop-portal > "$Z8_GUI_SESSION_ROOT/portal.log" 2>&1 &
portal_pid=$!
cleanup() {
    kill "$portal_pid" "$gtk_pid" 2>/dev/null || true
    wait "$portal_pid" "$gtk_pid" 2>/dev/null || true
}
trap cleanup EXIT
node scripts/desktop-preview-gui.mjs --packaged-product
