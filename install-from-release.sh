#!/bin/bash
set -e
REPO="SathishKrds/openvpn"
DEB_NAME="k-openvpn"

echo "Fetching latest release from GitHub..."
JSON=$(curl -s "https://api.github.com/repos/$REPO/releases/latest")
TAG=$(echo "$JSON" | grep -oP '"tag_name":\s*"\K[^"]+')
URL=$(echo "$JSON" | grep -oP '"browser_download_url":\s*"\K[^"]+\.deb' | head -1)

if [ -z "$URL" ]; then
  echo "No .deb found in latest release. Create a release and upload k-openvpn_*_amd64.deb at:"
  echo "  https://github.com/$REPO/releases"
  exit 1
fi

echo "Downloading $DEB_NAME from release $TAG..."
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT
curl -sSL -o "$TMP/pkg.deb" "$URL"

echo "Installing..."
sudo dpkg -i "$TMP/pkg.deb"
sudo apt install -f -y
echo ""
echo "Done. Run: $DEB_NAME   or open 'VPN Connect' from the app menu."
