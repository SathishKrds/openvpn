#!/bin/bash
set -e

INSTALL_DIR="${HOME}/.local/share/vpn-connect"
BIN_LAUNCHER="${HOME}/.local/bin/vpn-connect"
DESKTOP_FILE="${HOME}/.local/share/applications/vpn-connect.desktop"

echo "=== VPN Connect Uninstaller ==="
echo ""

if command -v fuser >/dev/null 2>&1; then
  fuser -k 8765/tcp 2>/dev/null && echo "Stopped VPN Connect backend on port 8765." || true
fi

if [ -f "$BIN_LAUNCHER" ]; then
  rm -f "$BIN_LAUNCHER"
  echo "Removed: $BIN_LAUNCHER"
fi

if [ -f "$DESKTOP_FILE" ]; then
  rm -f "$DESKTOP_FILE"
  echo "Removed: $DESKTOP_FILE"
fi

if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  echo "Removed: $INSTALL_DIR"
fi

OLD_INSTALL="${HOME}/.local/share/vpn-connect-pro"
OLD_LAUNCHER="${HOME}/.local/bin/vpn-connect-pro"
OLD_DESKTOP="${HOME}/.local/share/applications/vpn-connect-pro.desktop"
[ -f "$OLD_LAUNCHER" ] && rm -f "$OLD_LAUNCHER" && echo "Removed: $OLD_LAUNCHER"
[ -f "$OLD_DESKTOP" ] && rm -f "$OLD_DESKTOP" && echo "Removed: $OLD_DESKTOP"
[ -d "$OLD_INSTALL" ] && rm -rf "$OLD_INSTALL" && echo "Removed: $OLD_INSTALL"

echo ""
echo "VPN Connect has been uninstalled."
echo "To reinstall, run:  ./install.sh"
echo ""
