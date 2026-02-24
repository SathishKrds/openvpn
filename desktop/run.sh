#!/bin/bash
INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="${XDG_DATA_HOME:-$HOME/.local/share}/vpn-connect/launch.log"
ELECTRON="$INSTALL_DIR/node_modules/.bin/electron"

if [ -f "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi
NODE_PATHS="/usr/local/bin:/usr/bin:$HOME/.local/bin:/snap/bin"
[ -d "$HOME/.nvm/versions/node" ] && for d in "$HOME/.nvm/versions/node"/*/bin; do [ -d "$d" ] && NODE_PATHS="$d:$NODE_PATHS"; done
export PATH="$NODE_PATHS:$PATH"

show_error() {
  local msg="$1"
  mkdir -p "$(dirname "$LOG_FILE")"
  echo "$(date -Iseconds) $msg" >> "$LOG_FILE"
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --title="VPN Connect" --text="$msg" 2>/dev/null
  else
    echo "VPN Connect: $msg" >&2
  fi
}

if [ ! -x "$ELECTRON" ]; then
  show_error "Electron not found.\n\nRe-run the installer from the project folder:\n  ./install.sh"
  exit 1
fi

cd "$INSTALL_DIR" || exit 1
"$ELECTRON" "$INSTALL_DIR"
EXIT=$?
if [ $EXIT -ne 0 ]; then
  show_error "App failed (exit code $EXIT).\n\nLog: $LOG_FILE"
  exit $EXIT
fi
