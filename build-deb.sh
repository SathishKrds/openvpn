#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
VERSION="${1:-1.0.0}"
PKG_NAME=k-openvpn
BUILD_DIR="$SCRIPT_DIR/debian/build"
DEST="$BUILD_DIR/usr/share/$PKG_NAME"
BIN_DEST="$BUILD_DIR/usr/bin"
APP_DEST="$BUILD_DIR/usr/share/applications"

echo "=== Building $PKG_NAME .deb (version $VERSION) ==="
echo ""

if [ ! -f "vpn-connect/dist/index.html" ]; then
  echo "Building frontend..."
  (cd vpn-connect && npm install && npm run build)
fi
if [ ! -f "vpn-connect/dist/index.html" ]; then
  echo "Error: vpn-connect/dist missing. Run: cd vpn-connect && npm run build"
  exit 1
fi

echo "Staging files..."
rm -rf "$BUILD_DIR"
mkdir -p "$DEST" "$BIN_DEST" "$APP_DEST"

cp backend/server.py "$DEST/"
cp -r vpn-connect/dist "$DEST/"
cp desktop/main.js desktop/package.json desktop/run.sh "$DEST/"
[ -f desktop/icon.jpeg ] && cp desktop/icon.jpeg "$DEST/"
chmod +x "$DEST/server.py" "$DEST/run.sh"

sed -i "s|vpn-connect|k-openvpn|g" "$DEST/run.sh"
sed -i 's|./install.sh|sudo apt install --reinstall k-openvpn|g' "$DEST/run.sh"

cat > "$DEST/package.json" << 'PKGJSON'
{"name":"k-openvpn","version":"1.0.0","private":true,"main":"main.js","description":"OpenVPN desktop application for Ubuntu","dependencies":{"electron":"^28.0.0"}}
PKGJSON

echo "Installing Electron in package (this may take a few minutes)..."
(cd "$DEST" && npm install --omit=dev --no-package-lock --progress=true)
echo "Electron installed."

cat > "$BIN_DEST/k-openvpn" << 'BIN'
#!/bin/bash
export VPN_CONNECT_STATIC=/usr/share/k-openvpn/dist
export VPN_CONNECT_CONFIG_DIR=k-openvpn
exec /usr/share/k-openvpn/run.sh
BIN
chmod +x "$BIN_DEST/k-openvpn"

cat > "$APP_DEST/k-openvpn.desktop" << 'DESKTOP'
[Desktop Entry]
Name=VPN Connect
Comment=OpenVPN desktop application for Ubuntu
Exec=/usr/bin/k-openvpn
Icon=/usr/share/k-openvpn/icon.jpeg
Terminal=false
Type=Application
Categories=Network;
StartupNotify=true
StartupWMClass=k-openvpn
DESKTOP

mkdir -p "$BUILD_DIR/DEBIAN"
cat > "$BUILD_DIR/DEBIAN/control" << EOF
Package: $PKG_NAME
Version: $VERSION
Section: net
Priority: optional
Architecture: amd64
Depends: openvpn, python3, python3-flask, python3-flask-cors, nodejs
Maintainer: VPN Connect Maintainers
Description: OpenVPN desktop application for Ubuntu
 VPN Connect is a desktop app to connect and disconnect OpenVPN
 with a simple UI, saved profiles, and live diagnostics.
EOF

cp debian/postinst "$BUILD_DIR/DEBIAN/"
chmod 755 "$BUILD_DIR/DEBIAN/postinst"

echo "Building .deb..."
dpkg-deb --root-owner-group -b "$BUILD_DIR" "${PKG_NAME}_${VERSION}_amd64.deb"
rm -rf "$BUILD_DIR"
echo ""
echo "Done: ${PKG_NAME}_${VERSION}_amd64.deb"
echo "Install with: sudo dpkg -i ${PKG_NAME}_${VERSION}_amd64.deb"
echo "  (install missing deps if needed: sudo apt install -f)"
echo "Or publish to an apt repo so users can: sudo apt install k-openvpn"
echo ""
