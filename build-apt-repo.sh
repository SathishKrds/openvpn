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
dpkg-scanpackages pool/main /dev/null > dists/stable/main/binary-amd64/Packages
cd "$SCRIPT_DIR"

PKG_GZ="$REPO_DIR/dists/stable/main/binary-amd64/Packages.gz"
PKG="$REPO_DIR/dists/stable/main/binary-amd64/Packages"
MD5_GZ=$(md5sum "$PKG_GZ" | cut -d' ' -f1)
SHA256_GZ=$(sha256sum "$PKG_GZ" | cut -d' ' -f1)
SIZE_GZ=$(wc -c < "$PKG_GZ")
MD5_PKG=$(md5sum "$PKG" | cut -d' ' -f1)
SHA256_PKG=$(sha256sum "$PKG" | cut -d' ' -f1)
SIZE_PKG=$(wc -c < "$PKG")

cat > "$REPO_DIR/dists/stable/Release" << EOF
Origin: k-openvpn
Label: k-openvpn
Codename: stable
Architectures: amd64
Components: main
Description: VPN Connect - OpenVPN desktop app
Date: $(date -Ru)
MD5Sum:
 $MD5_PKG $SIZE_PKG main/binary-amd64/Packages
 $MD5_GZ $SIZE_GZ main/binary-amd64/Packages.gz
SHA256:
 $SHA256_PKG $SIZE_PKG main/binary-amd64/Packages
 $SHA256_GZ $SIZE_GZ main/binary-amd64/Packages.gz
EOF

echo ""
echo "=== Publishing to docs/ (for GitHub Pages) ==="
rm -rf "$SCRIPT_DIR/docs"
cp -r "$REPO_DIR/." "$SCRIPT_DIR/docs/"
echo ""
echo "Done. Apt repo is in: apt-repo/  (also copied to docs/)"
echo ""
echo "To let users run:  sudo apt install k-openvpn"
echo "1. Upload the contents of apt-repo/ to a web server or GitHub Pages."
echo "2. If your repo URL is https://YOUR_USER.github.io/k-openvpn/, users run:"
echo ""
echo "   echo 'deb [arch=amd64 trusted=yes] https://YOUR_USER.github.io/openvpn stable main' | sudo tee /etc/apt/sources.list.d/k-openvpn.list"
echo "   sudo apt update"
echo "   sudo apt install k-openvpn"
echo ""
