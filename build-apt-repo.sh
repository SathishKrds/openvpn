#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
VERSION="${1:-1.0.0}"
REPO_DIR="$SCRIPT_DIR/apt-repo"

echo "=== Building .deb and apt repo for k-openvpn ==="
./build-deb.sh "$VERSION"

echo ""
echo "=== Creating apt repository layout ==="
rm -rf "$REPO_DIR"
mkdir -p "$REPO_DIR/pool/main" "$REPO_DIR/dists/stable/main/binary-amd64"
cp "k-openvpn_${VERSION}_amd64.deb" "$REPO_DIR/pool/main/"

cd "$REPO_DIR"
dpkg-scanpackages pool/main /dev/null | gzip -9c > dists/stable/main/binary-amd64/Packages.gz
cd "$SCRIPT_DIR"

cat > "$REPO_DIR/dists/stable/Release" << EOF
Origin: k-openvpn
Label: k-openvpn
Codename: stable
Architectures: amd64
Components: main
Description: VPN Connect - OpenVPN desktop app
EOF

echo ""
echo "Done. Apt repo is in: apt-repo/"
echo ""
echo "To let users run:  sudo apt install k-openvpn"
echo "1. Upload the contents of apt-repo/ to a web server or GitHub Pages."
echo "2. If your repo URL is https://YOUR_USER.github.io/k-openvpn/, users run:"
echo ""
echo "   echo 'deb [arch=amd64 trusted=yes] https://YOUR_USER.github.io/openvpn stable main' | sudo tee /etc/apt/sources.list.d/k-openvpn.list"
echo "   sudo apt update"
echo "   sudo apt install k-openvpn"
echo ""
