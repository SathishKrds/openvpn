#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$HOME/.local/share/vpn-connect"
BIN_DIR="$HOME/.local/bin"

echo "=== VPN Connect Installer ==="
echo ""

echo "[1/7] Installing system dependencies..."
sudo apt update -q
sudo apt install -y openvpn python3 python3-pip

HAVE_NODE=false
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  HAVE_NODE=true
  echo "[2/7] Node.js found ($(node -v))."
else
  echo "[2/7] Installing Node.js (required for build and desktop app)..."
  if sudo apt install -y nodejs npm 2>/dev/null; then
    HAVE_NODE=true
  else
    echo "  apt install nodejs/npm failed (network or repo issue)."
    if [ -d "$SCRIPT_DIR/vpn-connect/dist" ] && [ -f "$SCRIPT_DIR/vpn-connect/dist/index.html" ]; then
      echo "  Using existing frontend build (vpn-connect/dist)."
    else
      echo ""
      echo "  To fix: install Node.js then re-run this script:"
      echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
      echo "    sudo apt install -y nodejs"
      echo "    ./install.sh"
      echo ""
      exit 1
    fi
  fi
fi

echo "[3/7] Preparing VPN Connect frontend..."
if [ "$HAVE_NODE" = true ]; then
  cd "$SCRIPT_DIR/vpn-connect"
  npm install
  npm run build
  cd "$SCRIPT_DIR"
fi
if [ ! -f "$SCRIPT_DIR/vpn-connect/dist/index.html" ]; then
  echo "Error: frontend build missing (vpn-connect/dist/index.html). Build with: cd vpn-connect && npm run build"
  exit 1
fi

echo "[4/7] Installing Python backend dependencies..."
pip3 install --user -r "$SCRIPT_DIR/backend/requirements.txt"

echo "[5/7] Installing to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_DIR/backend/server.py" "$INSTALL_DIR/server.py"
cp -r "$SCRIPT_DIR/vpn-connect/dist" "$INSTALL_DIR/dist"
cp "$SCRIPT_DIR/desktop/main.js" "$INSTALL_DIR/main.js"
cp "$SCRIPT_DIR/desktop/package.json" "$INSTALL_DIR/package.json"
cp "$SCRIPT_DIR/desktop/run.sh" "$INSTALL_DIR/run.sh"
[ -f "$SCRIPT_DIR/desktop/icon.jpeg" ] && cp "$SCRIPT_DIR/desktop/icon.jpeg" "$INSTALL_DIR/icon.jpeg"
chmod +x "$INSTALL_DIR/server.py" "$INSTALL_DIR/run.sh"

echo "[6/7] Installing desktop app (Electron)..."
cd "$INSTALL_DIR"
npm install --no-audit --no-fund
cd "$SCRIPT_DIR"

if command -v node >/dev/null 2>&1; then
  NODE_BIN_DIR=$(dirname "$(which node)")
  [ -n "$NODE_BIN_DIR" ] && sed -i "s|^NODE_PATHS=\"|NODE_PATHS=\"$NODE_BIN_DIR:|" "$INSTALL_DIR/run.sh"
fi

echo "[7/7] Creating launcher and app menu entry..."
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/vpn-connect" << EOF
#!/bin/bash
exec "$INSTALL_DIR/run.sh"
EOF
chmod +x "$BIN_DIR/vpn-connect"

mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/vpn-connect.desktop" << EOF
[Desktop Entry]
Name=VPN Connect
Comment=OpenVPN desktop application for Ubuntu 22.04
Exec=/bin/bash $INSTALL_DIR/run.sh
Icon=$INSTALL_DIR/icon.jpeg
Terminal=false
Type=Application
Categories=Network;
StartupNotify=true
StartupWMClass=vpn-connect
EOF

echo ""
echo "=== Optional: Allow openvpn without sudo password ==="
echo "  sudo visudo  # add: $USER ALL=(ALL) NOPASSWD: /usr/sbin/openvpn, /usr/bin/killall openvpn"
echo ""
echo "=== Installation complete ==="
echo "  Launch from app menu:  VPN Connect"
echo "  Or from terminal:  vpn-connect"
echo "  (If 'vpn-connect' not found, run:  $BIN_DIR/vpn-connect)"
echo "  Or add to PATH:  export PATH=\"\$HOME/.local/bin:\$PATH\""
echo "  The app opens in its own window (no browser)."
echo ""
