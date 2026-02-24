#!/bin/bash
set -e
DEB_NAME="k-openvpn"

if ! dpkg -s "$DEB_NAME" >/dev/null 2>&1; then
  echo "$DEB_NAME is not installed."
  exit 0
fi

echo "Removing $DEB_NAME..."
sudo apt remove -y "$DEB_NAME"
echo "Done. VPN Connect has been uninstalled."
