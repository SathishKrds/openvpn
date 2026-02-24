#!/usr/bin/env python3

import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path

try:
    from flask import Flask, request, jsonify, send_from_directory
    from flask_cors import CORS
except ImportError:
    print("Install dependencies: pip install flask flask-cors", file=sys.stderr)
    sys.exit(1)

app = Flask(__name__, static_folder=None)
CORS(app)

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
STATIC_DIR = Path(os.environ.get("VPN_CONNECT_STATIC", "") or str(PROJECT_ROOT / "vpn-connect" / "dist"))
if not STATIC_DIR.is_absolute():
    STATIC_DIR = PROJECT_ROOT / "vpn-connect" / "dist"
SUDOERS_FILE = "/etc/sudoers.d/vpn-connect"
USER = os.environ.get("USER") or os.popen("whoami").read().strip()

state = {
    "status": "disconnected",
    "logs": [],
    "connect_start_time": None,
    "vpn_process": None,
    "askpass_file": None,
    "pid": None,
    "ip": "---.---.---.---",
    "public_ip": None,
    "config_file": "",
    "encryption": "AES-256-GCM",
    "down_mbps": 0.0,
    "up_mbps": 0.0,
    "ping_ms": None,
    "_tun_rx_prev": None,
    "_tun_tx_prev": None,
    "_tun_time_prev": None,
    "lock": threading.Lock(),
}
MAX_LOGS = 1024
UPLOADED_CONFIGS_DIR = None
TUN_STATS_INTERVAL = 1.0
PING_INTERVAL = 2.0
_CONFIG_DIR = os.environ.get("VPN_CONNECT_CONFIG_DIR", "vpn-connect")
SAVED_CREDENTIALS_FILE = Path(os.path.expanduser("~")) / ".config" / _CONFIG_DIR / "saved.json"


def ensure_sudoers():
    if os.path.exists(SUDOERS_FILE):
        return True
    try:
        rule = (
            f"{USER} ALL=(ALL) NOPASSWD: /usr/sbin/openvpn\n"
            f"{USER} ALL=(ALL) NOPASSWD: /usr/bin/killall openvpn\n"
            f"{USER} ALL=(ALL) NOPASSWD: /bin/killall openvpn\n"
        )
        f = tempfile.NamedTemporaryFile(mode="w", suffix=".sh", delete=False)
        f.write(f"#!/bin/bash\nprintf '%s' '{rule}' > {SUDOERS_FILE}\nchmod 440 {SUDOERS_FILE}\n")
        f.close()
        os.chmod(f.name, 0o755)
        r = subprocess.run(["pkexec", "bash", f.name], capture_output=True, timeout=60)
        os.unlink(f.name)
        return r.returncode == 0
    except Exception:
        return False


def level_for_line(line):
    line_lower = line.lower()
    if "Initialization Sequence Completed" in line:
        return "SUCCESS"
    if "AUTH_FAILED" in line or "auth-failure" in line_lower or "ERROR" in line:
        return "ERROR"
    if "tun0:" in line or ("established" in line_lower and "tun" in line):
        return "TUN"
    if "Connecting to" in line or "TCP" in line:
        return "TCP"
    if "TLS" in line or "Peer Connection" in line:
        return "TLS"
    return "INFO"


def append_log(message, level=None):
    ts = datetime.now().strftime("%H:%M:%S")
    if level is None:
        level = level_for_line(message)
    with state["lock"]:
        state["logs"].append({"timestamp": ts, "level": level, "message": message})
        if len(state["logs"]) > MAX_LOGS:
            state["logs"] = state["logs"][-MAX_LOGS:]


def cleanup_askpass():
    with state["lock"]:
        path = state.get("askpass_file")
        state["askpass_file"] = None
    if path and os.path.exists(path):
        try:
            os.unlink(path)
        except Exception:
            pass


def fetch_public_ip():
    try:
        import urllib.request
        with urllib.request.urlopen("https://api.ipify.org", timeout=10) as r:
            pub = r.read().decode().strip()
            if pub and re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", pub):
                with state["lock"]:
                    if state["status"] == "connected":
                        state["public_ip"] = pub
    except Exception:
        pass


def _ping_target_from_config(config_path):
    if not config_path or not os.path.isfile(config_path):
        return None
    try:
        with open(config_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("remote ") and not line.startswith("remote-cert"):
                    parts = line.split()
                    if len(parts) >= 2:
                        host = parts[1]
                        if re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", host):
                            return host
                        return host
    except Exception:
        pass
    return None


def _measure_ping(target="8.8.8.8"):
    try:
        r = subprocess.run(
            ["ping", "-c", "1", "-W", "3", target],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if r.returncode != 0:
            return None
        m = re.search(r"time[= ]([\d.]+)\s*ms", r.stdout)
        if m:
            return round(float(m.group(1)))
        m = re.search(r"rtt min/avg/max = [\d./]+/([\d.]+)/[\d./]+ ms", r.stdout)
        if m:
            return round(float(m.group(1)))
    except Exception:
        pass
    return None


def _ping_loop():
    while True:
        time.sleep(PING_INTERVAL)
        with state["lock"]:
            if state["status"] != "connected":
                state["ping_ms"] = None
                continue
            config_file = state.get("config_file") or ""
        target = _ping_target_from_config(config_file) if config_file else None
        if not target:
            target = "8.8.8.8"
        ms = _measure_ping(target)
        with state["lock"]:
            if state["status"] == "connected":
                state["ping_ms"] = ms


def _read_tun_stats(iface="tun0"):
    rx_path = Path(f"/sys/class/net/{iface}/statistics/rx_bytes")
    tx_path = Path(f"/sys/class/net/{iface}/statistics/tx_bytes")
    if rx_path.exists() and tx_path.exists():
        try:
            rx = int(rx_path.read_text().strip())
            tx = int(tx_path.read_text().strip())
            return (rx, tx)
        except Exception:
            pass
    try:
        with open("/proc/net/dev") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 17 and (parts[0].startswith("tun") and ":" in parts[0]):
                    name = parts[0].rstrip(":")
                    if name == iface or (iface == "tun0" and name.startswith("tun")):
                        rx = int(parts[1])
                        tx = int(parts[9])
                        return (rx, tx)
    except Exception:
        pass
    return (None, None)


def _throughput_loop():
    while True:
        time.sleep(TUN_STATS_INTERVAL)
        with state["lock"]:
            if state["status"] != "connected":
                state["down_mbps"] = 0.0
                state["up_mbps"] = 0.0
                state["_tun_rx_prev"] = None
                state["_tun_tx_prev"] = None
                state["_tun_time_prev"] = None
                continue
        rx, tx = _read_tun_stats("tun0")
        if rx is None:
            rx, tx = _read_tun_stats("tun1")
        if rx is None or tx is None:
            with state["lock"]:
                if state["status"] == "connected":
                    state["down_mbps"] = 0.0
                    state["up_mbps"] = 0.0
            continue
        now = time.time()
        with state["lock"]:
            if state["status"] != "connected":
                continue
            prev_rx = state["_tun_rx_prev"]
            prev_tx = state["_tun_tx_prev"]
            prev_time = state["_tun_time_prev"]
            state["_tun_rx_prev"] = rx
            state["_tun_tx_prev"] = tx
            state["_tun_time_prev"] = now
            if prev_time is not None and prev_rx is not None and (now - prev_time) > 0:
                elapsed = now - prev_time
                state["down_mbps"] = round(max(0, 8 * (rx - prev_rx) / elapsed / 1e6), 2)
                state["up_mbps"] = round(max(0, 8 * (tx - prev_tx) / elapsed / 1e6), 2)


def run_vpn(config_path: str, password: str):
    with state["lock"]:
        state["status"] = "connecting"
        state["config_file"] = config_path
    append_log(f"Connecting: {os.path.basename(config_path)}", "INFO")
    try:
        askpass = tempfile.NamedTemporaryFile(mode="w", suffix=".pass", delete=False)
        askpass.write(password + "\n")
        askpass.close()
        os.chmod(askpass.name, 0o600)
        with state["lock"]:
            state["askpass_file"] = askpass.name

        cmd = [
            "sudo", "openvpn",
            "--config", config_path,
            "--askpass", askpass.name,
            "--auth-nocache",
            "--verb", "3",
        ]
        cwd = os.path.dirname(os.path.abspath(config_path))
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            bufsize=1,
            cwd=cwd,
        )
        with state["lock"]:
            state["vpn_process"] = proc
            state["pid"] = proc.pid

        def read_stream(stream):
            for line in stream:
                line = line.strip()
                if not line:
                    continue
                append_log(line)
                if "Initialization Sequence Completed" in line:
                    with state["lock"]:
                        state["status"] = "connected"
                        state["connect_start_time"] = time.time()
                    append_log("VPN Connected!", "SUCCESS")
                    cleanup_askpass()
                    def fetch_public_ip_retry():
                        for _ in range(5):
                            fetch_public_ip()
                            with state["lock"]:
                                if state.get("public_ip") or state["status"] != "connected":
                                    return
                            time.sleep(2)
                    threading.Thread(target=fetch_public_ip_retry, daemon=True).start()
                if "AUTH_FAILED" in line or "auth-failure" in line.lower():
                    append_log("VPN authentication failed.", "ERROR")
                if "bad decrypt" in line.lower():
                    append_log("Wrong private key password.", "ERROR")
                if "tun0:" in line or ("established" in line.lower() and ("tun" in line or "/24" in line)):
                    for m in re.finditer(r"(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})", line):
                        a, b, c, d = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
                        if (a == 10) or (a == 172 and 16 <= b <= 31) or (a == 192 and b == 168):
                            with state["lock"]:
                                state["ip"] = m.group(0)
                            break

        t1 = threading.Thread(target=read_stream, args=(proc.stdout,), daemon=True)
        t2 = threading.Thread(target=read_stream, args=(proc.stderr,), daemon=True)
        t1.start()
        t2.start()
        proc.wait()
        t1.join(timeout=2)
        t2.join(timeout=2)
    except Exception as e:
        append_log(str(e), "ERROR")
    finally:
        cleanup_askpass()
        append_log("Disconnected.", "INFO")
        with state["lock"]:
            state["status"] = "disconnected"
            state["vpn_process"] = None
            state["pid"] = None
            state["connect_start_time"] = None
            state["ip"] = "---.---.---.---"
            state["public_ip"] = None
            state["down_mbps"] = 0.0
            state["up_mbps"] = 0.0
            state["ping_ms"] = None
            state["_tun_rx_prev"] = None
            state["_tun_tx_prev"] = None
            state["_tun_time_prev"] = None


@app.route("/api/status")
def api_status():
    with state["lock"]:
        st = state["status"]
        pid = state["pid"]
        ip = state["ip"]
        public_ip = state.get("public_ip")
        config_file = state["config_file"]
        encryption = state["encryption"]
        connect_start = state["connect_start_time"]
        down_mbps = state.get("down_mbps", 0.0)
        up_mbps = state.get("up_mbps", 0.0)
        ping_ms = state.get("ping_ms")
    duration_seconds = 0
    if connect_start and st == "connected":
        duration_seconds = int(max(0, time.time() - connect_start))

    saved_profiles = []
    if SAVED_CREDENTIALS_FILE.exists():
        try:
            with open(SAVED_CREDENTIALS_FILE) as f:
                saved = json.load(f)
                if "profiles" in saved:
                    saved_profiles = saved["profiles"]
                elif saved.get("config_path") or saved.get("password"):
                    saved_profiles = [{"config_path": saved.get("config_path") or "", "password": saved.get("password") or ""}]
        except Exception:
            pass
    for p in saved_profiles:
        if "name" not in p and p.get("config_path"):
            p["name"] = os.path.basename(p["config_path"])

    return jsonify({
        "connected": st == "connected",
        "connecting": st == "connecting",
        "status": st,
        "duration_seconds": duration_seconds,
        "ip": ip,
        "public_ip": public_ip,
        "pid": pid,
        "down_mbps": down_mbps,
        "up_mbps": up_mbps,
        "ping_ms": ping_ms,
        "config_file": config_file or "",
        "config_name": os.path.basename(config_file) if config_file else "",
        "encryption": encryption,
        "saved_profiles": saved_profiles,
        "logs": state["logs"][-200:],
    })


@app.route("/api/connect", methods=["POST"])
def api_connect():
    data = request.get_json() or {}
    config_path = (data.get("config_path") or "").strip()
    password = data.get("password") or ""
    if not config_path or not os.path.exists(config_path):
        return jsonify({"ok": False, "error": "Select a valid .ovpn file."}), 400
    if not password:
        return jsonify({"ok": False, "error": "Enter your private key password."}), 400
    with state["lock"]:
        if state["vpn_process"] is not None:
            return jsonify({"ok": False, "error": "Already connected or connecting."}), 400

    try:
        SAVED_CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)
        profiles = []
        if SAVED_CREDENTIALS_FILE.exists():
            try:
                with open(SAVED_CREDENTIALS_FILE) as f:
                    data = json.load(f)
                    profiles = data.get("profiles") or []
                    if not profiles and (data.get("config_path") or data.get("password")):
                        profiles = [{"config_path": data.get("config_path") or "", "password": data.get("password") or ""}]
            except Exception:
                pass
        found = False
        for p in profiles:
            if p.get("config_path") == config_path:
                p["password"] = password
                found = True
                break
        if not found:
            profiles.append({"config_path": config_path, "password": password})
        with open(SAVED_CREDENTIALS_FILE, "w") as f:
            json.dump({"profiles": profiles}, f, indent=0)
        os.chmod(SAVED_CREDENTIALS_FILE, 0o600)
    except Exception:
        pass

    threading.Thread(target=run_vpn, args=(config_path, password), daemon=True).start()
    return jsonify({"ok": True})


@app.route("/api/disconnect", methods=["POST"])
def api_disconnect():
    with state["lock"]:
        proc = state["vpn_process"]
        state["vpn_process"] = None
        state["pid"] = None
        state["connect_start_time"] = None
        state["status"] = "disconnected"
        state["ip"] = "---.---.---.---"
        state["public_ip"] = None
        state["down_mbps"] = 0.0
        state["up_mbps"] = 0.0
        state["ping_ms"] = None
    if proc:
        try:
            proc.terminate()
        except Exception:
            pass
    try:
        subprocess.run(["sudo", "killall", "openvpn"], capture_output=True, timeout=5)
    except Exception:
        pass
    cleanup_askpass()
    append_log("Disconnecting...", "INFO")
    return jsonify({"ok": True})


@app.route("/api/logs")
def api_logs():
    with state["lock"]:
        return jsonify({"logs": list(state["logs"])})


def _native_browse_ovpn():
    try:
        r = subprocess.run(
            ["zenity", "--file-selection", "--title=Select OVPN config", "--file-filter=OVPN files (*.ovpn) | *.ovpn"],
            capture_output=True,
            text=True,
            timeout=120,
            env={**os.environ},
        )
        if r.returncode == 0 and r.stdout:
            path = r.stdout.strip()
            if path and os.path.isfile(path):
                return path
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        pass
    try:
        r = subprocess.run(
            ["kdialog", "--getopenfilename", os.path.expanduser("~"), "OVPN files (*.ovpn)"],
            capture_output=True,
            text=True,
            timeout=120,
            env={**os.environ},
        )
        if r.returncode == 0 and r.stdout:
            path = r.stdout.strip()
            if path and os.path.isfile(path):
                return path
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        pass
    try:
        code = """
import sys
try:
    from tkinter import Tk, filedialog
    root = Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    path = filedialog.askopenfilename(title='Select OVPN config', filetypes=[('OVPN files', '*.ovpn'), ('All files', '*')])
    if path:
        print(path)
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
"""
        r = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            timeout=120,
            env={**os.environ},
            cwd=os.path.expanduser("~"),
        )
        if r.returncode == 0 and r.stdout.strip():
            path = r.stdout.strip()
            if os.path.isfile(path):
                return path
    except Exception:
        pass
    return None


@app.route("/api/browse-config", methods=["GET", "POST"])
def api_browse_config():
    path = _native_browse_ovpn()
    if not path:
        return jsonify({
            "ok": False,
            "error": "No file selected. If no dialog appeared, install a file picker: sudo apt install zenity",
            "path": "",
            "name": "",
        })
    return jsonify({"ok": True, "path": path, "name": os.path.basename(path)})


@app.route("/api/upload-config", methods=["POST"])
def api_upload_config():
    global UPLOADED_CONFIGS_DIR
    f = request.files.get("file")
    if not f or f.filename == "":
        return jsonify({"ok": False, "error": "No file selected."}), 400
    if not (f.filename.lower().endswith(".ovpn")):
        return jsonify({"ok": False, "error": "Only .ovpn files are allowed."}), 400
    try:
        if UPLOADED_CONFIGS_DIR is None:
            UPLOADED_CONFIGS_DIR = Path(tempfile.mkdtemp(prefix="vpn-connect-"))
        safe_name = os.path.basename(f.filename).replace("..", "_")
        dest = UPLOADED_CONFIGS_DIR / safe_name
        f.save(str(dest))
        return jsonify({"ok": True, "path": str(dest.resolve()), "name": safe_name})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/")
def index():
    if STATIC_DIR.exists():
        return send_from_directory(STATIC_DIR, "index.html")
    return "<h1>VPN Connect</h1><p>Frontend not built. Run: cd vpn-connect && npm run build</p>", 404


@app.route("/<path:path>")
def serve_static(path):
    if not STATIC_DIR.exists():
        return "Not found", 404
    file_path = STATIC_DIR / path
    if file_path.is_file():
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, "index.html")


def main():
    threading.Thread(target=_throughput_loop, daemon=True).start()
    threading.Thread(target=_ping_loop, daemon=True).start()

    port = 8765
    open_browser = True
    for arg in sys.argv[1:]:
        if arg.startswith("--port="):
            port = int(arg.split("=", 1)[1])
        elif arg == "--open-browser":
            open_browser = True
        elif arg == "--no-browser":
            open_browser = False

    if not STATIC_DIR.exists():
        print("Warning: Frontend not built. Run: cd vpn-connect && npm run build", file=sys.stderr)

    url = f"http://127.0.0.1:{port}"
    if open_browser:
        def open_later():
            time.sleep(1.2)
            try:
                import webbrowser
                webbrowser.open(url)
            except Exception:
                pass
        threading.Thread(target=open_later, daemon=True).start()

    print(f"VPN Connect backend at {url}")
    app.run(host="127.0.0.1", port=port, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
