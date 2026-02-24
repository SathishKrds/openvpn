# VPN Connect

Desktop app to connect to OpenVPN from a simple UI (set your `.ovpn` path and password, then connect).

## Install

On Ubuntu, run:

```bash
curl -sSL https://raw.githubusercontent.com/SathishKrds/openvpn/main/install-from-release.sh | sudo bash
```

This downloads the latest `.deb` from GitHub Releases and installs it. Then open **VPN Connect** from your app menu.

## Uninstall

```bash
curl -sSL https://raw.githubusercontent.com/SathishKrds/openvpn/main/uninstall-from-release.sh | sudo bash
```

Or: `sudo apt remove k-openvpn`

---

*Developers / apt repo / API:* see the repo for build steps and backend API.
