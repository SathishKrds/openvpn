# VPN Connect

Desktop app to connect to OpenVPN from a simple UI (set your `.ovpn` path and password, then connect).

## Install

```bash
echo 'deb [arch=amd64 trusted=yes] https://SathishKrds.github.io/openvpn stable main' | sudo tee /etc/apt/sources.list.d/k-openvpn.list
sudo apt update
sudo apt install k-openvpn
```

One-liner:

```bash
echo 'deb [arch=amd64 trusted=yes] https://SathishKrds.github.io/openvpn stable main' | sudo tee /etc/apt/sources.list.d/k-openvpn.list && sudo apt update && sudo apt install -y k-openvpn
```

Then open **VPN Connect** from your app menu.

## Uninstall

```bash
curl -sSL https://raw.githubusercontent.com/SathishKrds/openvpn/main/uninstall-from-release.sh | sudo bash
```

Or: `sudo apt remove k-openvpn`

---