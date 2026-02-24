import React, { useState, useEffect, useRef } from 'react';
import { 
  Power, 
  Settings, 
  Shield, 
  Activity, 
  Clock, 
  ArrowDown, 
  ArrowUp, 
  Hash,
  FileText,
  Lock,
  ExternalLink,
  Download,
  Sun,
  Moon,
  X,
  Check,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'TCP' | 'TLS' | 'SUCCESS' | 'ERROR' | 'TUN';
  message: string;
}

const API_BASE = '';

interface ApiStatus {
  connected: boolean;
  connecting: boolean;
  status: string;
  duration_seconds: number;
  ip: string;
  public_ip: string | null;
  pid: number | null;
  down_mbps: number;
  up_mbps: number;
  ping_ms: number | null;
  config_file: string;
  config_name: string;
  encryption: string;
  saved_profiles: { config_path: string; password: string; name?: string }[];
  logs: LogEntry[];
}

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [duration, setDuration] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    autoConnect: true,
    killSwitch: false,
    protocol: 'OpenVPN (UDP)',
    notifications: true
  });
  const [configPath, setConfigPath] = useState('');
  const [password, setPassword] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [ip, setIp] = useState('---.---.---.---');
  const [publicIp, setPublicIp] = useState<string | null>(null);
  const [pid, setPid] = useState<number | null>(null);
  const [downMbps, setDownMbps] = useState(0);
  const [upMbps, setUpMbps] = useState(0);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [configName, setConfigName] = useState('');
  const [encryption, setEncryption] = useState('AES-256-GCM');
  const [savedProfiles, setSavedProfiles] = useState<{ config_path: string; password: string; name?: string }[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const userAtBottomRef = useRef(true);
  const hasLoadedSavedRef = useRef(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/status`);
        if (!res.ok) return;
        const data: ApiStatus = await res.json();
        setApiConnected(true);
        setApiError(null);
        setIsConnected(data.connected);
        setIsConnecting(data.connecting);
        setDuration(data.duration_seconds);
        setIp(data.ip || '---.---.---.---');
        setPublicIp(data.public_ip ?? null);
        setPid(data.pid ?? null);
        setDownMbps(typeof data.down_mbps === 'number' ? data.down_mbps : 0);
        setUpMbps(typeof data.up_mbps === 'number' ? data.up_mbps : 0);
        setPingMs(typeof data.ping_ms === 'number' ? data.ping_ms : null);
        setConfigName(data.config_name || '');
        setEncryption(data.encryption || 'AES-256-GCM');
        if (data.logs?.length) setLogs(data.logs);
        setSavedProfiles(Array.isArray(data.saved_profiles) ? data.saved_profiles : []);
        if (!hasLoadedSavedRef.current && Array.isArray(data.saved_profiles) && data.saved_profiles.length > 0) {
          hasLoadedSavedRef.current = true;
          const first = data.saved_profiles[0];
          if (first?.config_path) setConfigPath(first.config_path);
          if (first?.password) setPassword(first.password);
        }
      } catch {
        setApiConnected(false);
        setApiError('Backend not running. Start: python3 backend/server.py');
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (userAtBottomRef.current && logContainerRef.current) {
      const el = logContainerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
  };

  const toggleConnection = async () => {
    setApiError(null);
    if (isConnected || isConnecting) {
      try {
        await fetch(`${API_BASE}/api/disconnect`, { method: 'POST' });
      } catch (e) {
        setApiError('Disconnect failed');
      }
      return;
    }
    if (!configPath.trim()) {
      setApiError('Select a valid .ovpn file.');
      return;
    }
    if (!password) {
      setApiError('Enter your private key password.');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_path: configPath.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setApiError(data.error || 'Connect failed');
      }
    } catch {
      setApiError('Connect failed');
    }
  };

  const displayIp = (publicIp || ip || '---.---.---.---').trim();
  const handleBrowseConfig = async () => {
    setApiError(null);
    try {
      const res = await fetch(`${API_BASE}/api/browse-config`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.path) {
        setConfigPath(data.path);
        setConfigName(data.name || '');
      } else if (data.error) {
        setApiError(data.error);
      }
    } catch {
      setApiError('Could not open file picker');
    }
  };

  const exportLogs = () => {
    const blob = new Blob([logs.map(l => `[${l.timestamp}] ${l.level}: ${l.message}`).join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vpn-connect-log-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const getLogLevelColor = (level: string) => {
    if (theme === 'light') {
      switch (level) {
        case 'INFO': return 'text-blue-600';
        case 'TCP': return 'text-orange-600';
        case 'TLS': return 'text-purple-600';
        case 'SUCCESS': return 'text-emerald-600';
        case 'ERROR': return 'text-red-600';
        case 'TUN': return 'text-emerald-700 font-bold';
        default: return 'text-gray-500';
      }
    }
    switch (level) {
      case 'INFO': return 'text-blue-400';
      case 'TCP': return 'text-orange-400';
      case 'TLS': return 'text-purple-400';
      case 'SUCCESS': return 'text-emerald-400';
      case 'ERROR': return 'text-red-400';
      case 'TUN': return 'text-emerald-500 font-bold';
      default: return 'text-gray-400';
    }
  };

  const themeClasses = {
    bg: theme === 'dark' ? 'bg-[#050608]' : 'bg-[#F9FAFB]',
    card: theme === 'dark' ? 'bg-vpn-bg' : 'bg-white',
    cardInner: theme === 'dark' ? 'bg-vpn-card' : 'bg-gray-50',
    border: theme === 'dark' ? 'border-vpn-border' : 'border-gray-200',
    text: theme === 'dark' ? 'text-gray-200' : 'text-gray-800',
    textMuted: theme === 'dark' ? 'text-vpn-text-muted' : 'text-gray-500',
    headerBg: theme === 'dark' ? 'bg-vpn-card/30' : 'bg-gray-50/50',
    diagBg: theme === 'dark' ? 'bg-[#080A0E]' : 'bg-gray-900',
  };

  return (
    <div className={`min-h-screen ${themeClasses.bg} flex items-center justify-center p-4 font-sans ${themeClasses.text} transition-colors duration-300`}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`w-full max-w-[720px] ${themeClasses.card} border ${themeClasses.border} rounded-2xl shadow-2xl overflow-hidden relative`}
      >
        <div className={`px-6 py-5 flex items-center justify-between border-b ${themeClasses.border} ${themeClasses.headerBg}`}>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)]">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">VPN Connect</h1>
              </div>
              <p className={`text-[10px] font-mono ${themeClasses.textMuted} uppercase tracking-widest`}>
                Session: <span className={isConnected ? 'text-emerald-400' : isConnecting ? 'text-amber-400' : 'text-red-400'}>
                  {isConnected ? 'Active' : isConnecting ? 'Connecting…' : 'Inactive'}
                </span> • tun0
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={`p-2 cursor-pointer hover:${themeClasses.cardInner} rounded-lg border border-transparent hover:${themeClasses.border} transition-all ${themeClasses.textMuted}`}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div className="p-8 grid grid-cols-12 gap-8">
          <div className="col-span-3 flex flex-col gap-4">
            <StatCard 
              label="Down" 
              value={(isConnected ? downMbps : 0).toFixed(1)} 
              unit="Mb/s" 
              icon={<ArrowDown className="w-3 h-3" />} 
              color="text-emerald-500"
              theme={theme}
            />
            <StatCard 
              label="Up" 
              value={(isConnected ? upMbps : 0).toFixed(1)} 
              unit="Mb/s" 
              icon={<ArrowUp className="w-3 h-3" />} 
              color="text-blue-500"
              theme={theme}
            />
          </div>

          <div className="col-span-6 flex flex-col items-center justify-center">
            <div className="relative">
              <AnimatePresence>
                {isConnected && (
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1.2, opacity: 0.2 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 2, repeatType: 'reverse' }}
                    className="absolute inset-0 bg-emerald-500 rounded-full blur-3xl"
                  />
                )}
              </AnimatePresence>
              
              <button 
                onClick={toggleConnection}
                disabled={isConnecting && !isConnected}
                className={`relative w-32 h-32 rounded-full border-4 flex items-center justify-center transition-all duration-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 ${
                  isConnected 
                    ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.3)]' 
                    : isConnecting
                    ? 'border-amber-500 bg-amber-500/10'
                    : `border-${theme === 'dark' ? 'vpn-border' : 'gray-200'} ${themeClasses.cardInner} hover:border-gray-600`
                }`}
              >
                <Power className={`w-12 h-12 transition-colors duration-500 ${isConnected ? 'text-emerald-500' : isConnecting ? 'text-amber-500' : 'text-gray-400'}`} />
              </button>
            </div>

            <div className="mt-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : isConnecting ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`} />
                <span className={`text-xs font-bold uppercase tracking-[0.2em] ${isConnected ? 'text-emerald-500' : isConnecting ? 'text-amber-500' : 'text-gray-500'}`}>
                  {isConnected ? 'Connected' : isConnecting ? 'Connecting…' : 'Disconnected'}
                </span>
              </div>
              <div className={`${themeClasses.cardInner}/50 border ${themeClasses.border} px-4 py-1 rounded-full`}>
                <span className={`text-xs font-mono ${themeClasses.textMuted}`}>{displayIp}</span>
              </div>
              {apiError && <p className="mt-2 text-xs text-red-400">{apiError}</p>}
            </div>
          </div>

          <div className="col-span-3 flex flex-col gap-4">
            <StatCard 
              label="Duration" 
              value={isConnected ? formatDuration(duration) : "00:00:00"} 
              unit="" 
              icon={<Clock className="w-3 h-3" />} 
              color={theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}
              theme={theme}
            />
            <StatCard 
              label="Ping" 
              value={isConnected && pingMs != null ? String(pingMs) : "--"} 
              unit="ms" 
              icon={<Activity className="w-3 h-3" />} 
              color="text-orange-500"
              theme={theme}
            />
          </div>
        </div>

        {savedProfiles.length > 0 && (
          <div className="px-8 pt-2 pb-4">
            <p className={`text-[10px] font-bold ${themeClasses.textMuted} uppercase tracking-widest mb-3`}>Saved VPN</p>
            <div className="flex flex-col gap-3">
              {savedProfiles.map((profile, idx) => {
                const name = profile.name || profile.config_path.split('/').pop() || profile.config_path;
                return (
                  <div
                    key={idx}
                    className={`${themeClasses.cardInner} border ${themeClasses.border} rounded-xl p-4 flex items-center justify-between gap-4`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                        <Shield className="w-5 h-5 text-blue-500" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-mono ${themeClasses.text} truncate`} title={profile.config_path}>
                          {name}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setConfigPath(profile.config_path);
                        setPassword(profile.password);
                        setApiError(null);
                      }}
                      className={`shrink-0 px-4 py-2 rounded-lg border cursor-pointer ${themeClasses.border} ${themeClasses.cardInner} font-medium text-sm hover:opacity-90 transition-opacity`}
                    >
                      Use this profile
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="px-8 pb-8 grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={`text-[10px] font-bold ${themeClasses.textMuted} uppercase tracking-widest flex items-center gap-2`}>
              <FileText className="w-3 h-3" /> Config Profile
            </label>
            {(isConnected || isConnecting) ? (
              <div className={`${themeClasses.cardInner} border ${themeClasses.border} p-3 rounded-lg flex items-center justify-between`}>
                <span className={`text-sm font-mono ${themeClasses.textMuted}`}>{configName || '—'}</span>
              </div>
            ) : (
              <div className="flex gap-2 items-stretch min-w-0">
                <input
                  type="text"
                  value={configPath}
                  onChange={e => setConfigPath(e.target.value)}
                  placeholder="Path or click Browse to pick file..."
                  className={`flex-1 min-w-0 ${themeClasses.cardInner} border ${themeClasses.border} p-3 rounded-lg text-sm font-mono ${themeClasses.textMuted} placeholder:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                <button
                  type="button"
                  onClick={handleBrowseConfig}
                  className={`shrink-0 px-4 py-2 min-w-[100px] rounded-lg border cursor-pointer ${themeClasses.border} ${themeClasses.cardInner} ${themeClasses.textMuted} hover:opacity-90 text-sm font-medium whitespace-nowrap`}
                >
                  Browse
                </button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <label className={`text-[10px] font-bold ${themeClasses.textMuted} uppercase tracking-widest flex items-center gap-2`}>
              <Lock className="w-3 h-3" /> Encryption
            </label>
            <div className={`${themeClasses.cardInner} border ${themeClasses.border} p-3 rounded-lg flex items-center justify-between`}>
              <span className={`text-sm font-mono ${themeClasses.textMuted}`}>{encryption}</span>
            </div>
          </div>
          {!(isConnected || isConnecting) && (
            <div className="col-span-2 space-y-2">
              <label className={`text-[10px] font-bold ${themeClasses.textMuted} uppercase tracking-widest flex items-center gap-2`}>
                <Lock className="w-3 h-3" /> Private Key Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter private key passphrase..."
                className={`w-full ${themeClasses.cardInner} border ${themeClasses.border} p-3 rounded-lg text-sm font-mono ${themeClasses.textMuted} placeholder:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>
          )}
        </div>

        <div className="px-8 pb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-blue-500 rounded-full" />
              <h2 className={`text-[10px] font-bold ${themeClasses.textMuted} uppercase tracking-widest`}>Live Diagnostics</h2>
            </div>
            <span className={`text-[9px] font-mono ${themeClasses.textMuted}/50 uppercase`}>Buffer: 1024 lines</span>
          </div>
          <div
            ref={logContainerRef}
            onScroll={() => {
              const el = logContainerRef.current;
              if (!el) return;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
              userAtBottomRef.current = atBottom;
            }}
            className={`${themeClasses.diagBg} border ${themeClasses.border} rounded-xl p-4 h-48 overflow-y-auto font-mono text-[11px] leading-relaxed scrollbar-thin scrollbar-thumb-vpn-border`}
          >
            {logs.map((log, i) => (
              <div key={i} className="flex gap-4 mb-1 group">
                <span className={`${theme === 'dark' ? 'text-vpn-text-muted/40' : 'text-gray-500/50'} shrink-0`}>[{log.timestamp}]</span>
                <span className={`shrink-0 w-12 ${getLogLevelColor(log.level)}`}>{log.level}:</span>
                <span className={`${theme === 'dark' ? 'text-gray-400 group-hover:text-gray-200' : 'text-gray-300 group-hover:text-white'} transition-colors`}>{log.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        <div className={`px-6 py-4 ${themeClasses.headerBg} border-t ${themeClasses.border} flex items-center justify-between`}>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className={`text-[10px] font-bold ${themeClasses.textMuted} uppercase tracking-wider`}>Daemon Running</span>
            </div>
            <div className={`flex items-center gap-2 border-l ${themeClasses.border} pl-6`}>
              <span className={`text-[10px] font-bold ${themeClasses.textMuted} uppercase tracking-wider`}>PID: {pid ?? '—'}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSettingsOpen(true)} className={`text-[10px] font-bold cursor-pointer ${themeClasses.textMuted} hover:${theme === 'dark' ? 'text-white' : 'text-black'} uppercase tracking-wider transition-colors flex items-center gap-1`}>
              Settings
            </button>
            <a href="https://openvpn.net/community-resources/" target="_blank" rel="noopener noreferrer" className={`text-[10px] font-bold cursor-pointer ${themeClasses.textMuted} hover:${theme === 'dark' ? 'text-white' : 'text-black'} uppercase tracking-wider transition-colors flex items-center gap-1`}>
              Documentation <ExternalLink className="w-3 h-3" />
            </a>
            <button onClick={exportLogs} className={`text-[10px] font-bold cursor-pointer ${themeClasses.textMuted} hover:${theme === 'dark' ? 'text-white' : 'text-black'} uppercase tracking-wider transition-colors flex items-center gap-1`}>
              Export Logs <Download className="w-3 h-3" />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className={`w-full max-w-md ${themeClasses.card} border ${themeClasses.border} rounded-2xl shadow-2xl overflow-hidden`}
              >
                <div className={`px-6 py-4 border-b ${themeClasses.border} flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-blue-500" />
                    <h3 className="font-semibold">Settings</h3>
                  </div>
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className={`p-1 cursor-pointer hover:${themeClasses.cardInner} rounded-full transition-colors`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="p-6 space-y-6">
                  <SettingToggle 
                    label="Auto-connect on startup" 
                    description="Automatically connect to the last used server when the app starts."
                    active={settings.autoConnect}
                    onClick={() => setSettings(s => ({ ...s, autoConnect: !s.autoConnect }))}
                    theme={theme}
                  />
                  <SettingToggle 
                    label="VPN Kill Switch" 
                    description="Block all internet traffic if the VPN connection drops unexpectedly."
                    active={settings.killSwitch}
                    onClick={() => setSettings(s => ({ ...s, killSwitch: !s.killSwitch }))}
                    theme={theme}
                  />
                  
                  <div className="space-y-2">
                    <label className={`text-[10px] font-bold ${themeClasses.textMuted} uppercase tracking-widest`}>Connection Protocol</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['OpenVPN (UDP)', 'WireGuard'].map(p => (
                        <button 
                          key={p}
                          onClick={() => setSettings(s => ({ ...s, protocol: p }))}
                          className={`px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-all flex items-center justify-between ${
                            settings.protocol === p 
                              ? 'border-blue-500 bg-blue-500/10 text-blue-500' 
                              : `${themeClasses.border} ${themeClasses.cardInner} ${themeClasses.textMuted} hover:border-gray-400`
                          }`}
                        >
                          {p}
                          {settings.protocol === p && <Check className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-blue-500/10' : 'bg-blue-50'} border border-blue-500/20 flex gap-3`}>
                    <Zap className="w-5 h-5 text-blue-500 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-blue-500">Smart Connect</p>
                      <p className={`text-[10px] ${theme === 'dark' ? 'text-blue-400/70' : 'text-blue-600/70'} leading-relaxed mt-1`}>
                        Enable Smart Connect to automatically find the fastest server based on your current location.
                      </p>
                    </div>
                  </div>
                </div>

                <div className={`px-6 py-4 bg-gray-50/50 ${theme === 'dark' ? 'bg-vpn-card/30' : ''} border-t ${themeClasses.border} flex justify-end`}>
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-lg shadow-blue-600/20"
                  >
                    Save Changes
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function SettingToggle({ label, description, active, onClick, theme }: { 
  label: string; 
  description: string; 
  active: boolean; 
  onClick: () => void;
  theme: 'dark' | 'light';
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className={`text-[10px] ${theme === 'dark' ? 'text-vpn-text-muted' : 'text-gray-500'} leading-relaxed`}>{description}</p>
      </div>
      <button 
        onClick={onClick}
        className={`shrink-0 w-10 h-5 rounded-full relative cursor-pointer transition-colors duration-300 ${active ? 'bg-emerald-500' : (theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200')}`}
      >
        <motion.div 
          animate={{ x: active ? 22 : 2 }}
          className="absolute top-1 left-0 w-3 h-3 bg-white rounded-full shadow-sm"
        />
      </button>
    </div>
  );
}

function StatCard({ label, value, unit, icon, color, theme }: { 
  label: string; 
  value: string; 
  unit: string; 
  icon: React.ReactNode;
  color: string;
  theme: 'dark' | 'light';
}) {
  const textMuted = theme === 'dark' ? 'text-vpn-text-muted' : 'text-gray-500';
  const cardBg = theme === 'dark' ? 'bg-vpn-card' : 'bg-white';
  const border = theme === 'dark' ? 'border-vpn-border' : 'border-gray-200';

  return (
    <div className={`${cardBg} border ${border} p-4 rounded-xl flex flex-col items-center justify-center text-center group hover:border-blue-500/30 transition-all shadow-sm`}>
      <span className={`text-[9px] font-bold ${textMuted} uppercase tracking-[0.2em] mb-2 flex items-center gap-1`}>
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-mono font-medium tracking-tight ${color}`}>{value}</span>
        {unit && <span className={`text-[10px] font-mono ${textMuted}`}>{unit}</span>}
      </div>
    </div>
  );
}
