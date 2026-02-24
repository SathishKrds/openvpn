# VPN Connect

OpenVPN desktop app: web UI frontend (vpn-connect folder) and Python backend for connection control.

## Quick start (development)

1. **Start the backend** (serves API + built frontend):
   ```bash
   pip install -r backend/requirements.txt
   cd vpn-connect && npm install && npm run build && cd ..
   python3 backend/server.py --open-browser
   ```
   UI opens at http://127.0.0.1:8765.

2. **Or run frontend in dev** (with hot reload) and backend separately:
   - Terminal 1: `python3 backend/server.py --no-browser` (API on port 8765)
   - Terminal 2: `cd vpn-connect && npm run dev` (Vite proxies `/api` to backend)
   - Open http://localhost:3000

## Installation (production)

From the project root:

```bash
chmod +x install.sh
./install.sh
```

This will:

- Install system deps: `openvpn`, `python3`, `node`/`npm`
- Build the frontend (vpn-connect)
- Install backend and static files under `~/.local/share/vpn-connect`
- Create launcher `vpn-connect` and desktop entry **VPN Connect**

When you run **VPN Connect**, the app opens in its own window. Set **Config profile** (path to `.ovpn` file) and **Private key password**, then click the power button to connect/disconnect.

## Install as system package (k-openvpn)

**End users** can install with:

```bash
sudo apt install k-openvpn
```

To enable that, you (the maintainer) must publish an apt repository once, then point users at it.

**One-time setup – build and publish the apt repo** (on Ubuntu 22.04, with node and npm installed):

```bash
chmod +x build-deb.sh build-apt-repo.sh
./build-apt-repo.sh 1.0.0
```

This creates `k-openvpn_1.0.0_amd64.deb` and an `apt-repo/` directory. Upload the **contents** of `apt-repo/` to a web server or GitHub Pages (e.g. so the base URL is `https://YOUR_USER.github.io/k-openvpn/`).

**Tell your users** to add the repo and install:

```bash
echo 'deb [trusted=yes] https://YOUR_USER.github.io/k-openvpn stable main' | sudo tee /etc/apt/sources.list.d/k-openvpn.list
sudo apt update
sudo apt install k-openvpn
```

Replace the URL with your actual repo URL. After that, **`sudo apt install k-openvpn`** is all they need for future installs or reinstalls.

Package installs to `/usr/share/k-openvpn` and adds `/usr/bin/k-openvpn` and a **VPN Connect** desktop entry. Config is stored in `~/.config/k-openvpn/`.

## Optional: sudoers for openvpn

To avoid password prompts when connecting:

```bash
sudo visudo
# Add (replace USER with your username):
USER ALL=(ALL) NOPASSWD: /usr/sbin/openvpn, /usr/bin/killall openvpn
```

## API (backend)

- `GET /api/status` – connection state, duration, IP, PID, logs
- `POST /api/connect` – body: `{ "config_path": "/path/to.ovpn", "password": "..." }`
- `POST /api/disconnect`
- `GET /api/logs` – full log list
