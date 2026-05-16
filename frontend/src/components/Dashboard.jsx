import React, { useState, useEffect, useRef } from 'react';
import { Power, Crosshair, Map as MapIcon, ShieldAlert, Settings, User, Search, Filter, Trash2, Bell, BellOff, Moon, Sun, Radio, Sliders, Save, RotateCcw, CheckCircle2, Circle, Cpu } from 'lucide-react';
import { format } from 'date-fns';
import CameraGrid from './CameraGrid';
import AlertSystem from './AlertSystem';
import MapSection from './MapSection';
import DetectionPanel from './DetectionPanel';
import { fetchAlerts, createAlert, subscribeAlerts, clearToken, fetchSettings, updateSettings, fetchStatus } from '../api';

const Dashboard = ({ session, onLogout }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState('cameras'); // 'cameras' | 'map' | 'alert-history' | 'settings'
  const [mapCenter, setMapCenter] = useState(null); // Used to zoom into alert
  const [alerts, setAlerts] = useState([]);
  const [resolvedAlerts, setResolvedAlerts] = useState(new Set());
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [currentAlert, setCurrentAlert] = useState(null);
  const [systemHealth, setSystemHealth] = useState({
    drones_online: 12,
    sat_link: 'SECURE',
    power_level: 98,
  });

  const toggleResolved = (id) =>
    setResolvedAlerts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Load historical alerts + subscribe to live SSE stream ──────────────────
  useEffect(() => {
    // 1. Initial load
    fetchAlerts({ limit: 50 })
      .then(data => {
        // Backend returns alert_type; normalise to 'type' for UI compatibility
        const normalised = data.map(a => ({ ...a, type: a.alert_type, lat: String(a.lat), lng: String(a.lng) }));
        setAlerts(normalised);
      })
      .catch(console.error);

    // 2. Live SSE stream
    const unsub = subscribeAlerts(
      (alert) => {
        const normalised = { ...alert, type: alert.alert_type, lat: String(alert.lat), lng: String(alert.lng) };
        playBeep();
        setCurrentAlert(normalised);
        setIsAlertModalOpen(true);
        setAlerts(prev => [normalised, ...prev].slice(0, 50));
      },
      () => console.warn('BSC alert stream closed — reconnect manually'),
    );

    return unsub;
  }, []);

  // ── Poll system status (health) ──────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      fetchStatus()
        .then(setSystemHealth)
        .catch(() => {});
    };
    update();
    const t = setInterval(update, 10000);
    return () => clearInterval(t);
  }, []);

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) { console.error('Audio error', e); }
  };

  // ── Test alert — creates a real record in the DB ───────────────────────────
  const triggerMockAlert = async () => {
    const body = {
      sector:     ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'][Math.floor(Math.random() * 4)],
      threat:     ['Unidentified Movement', 'Thermal Signature', 'Perimeter Breach', 'Drone Sighted'][Math.floor(Math.random() * 4)],
      camera:     `CAM-0${Math.floor(Math.random() * 4) + 1}`,
      lat:        parseFloat((32.4 + Math.random() * 0.2).toFixed(4)),
      lng:        parseFloat((76.4 + Math.random() * 0.2).toFixed(4)),
      alert_type: Math.random() > 0.5 ? 'critical' : 'warning',
    };
    try {
      await createAlert(body);
      // The SSE stream will receive the new alert and update UI automatically
    } catch (err) {
      // Fallback: show locally if backend is down
      const local = { ...body, id: Date.now(), timestamp: new Date().toISOString(), type: body.alert_type, lat: String(body.lat), lng: String(body.lng) };
      playBeep();
      setCurrentAlert(local);
      setIsAlertModalOpen(true);
      setAlerts(prev => [local, ...prev].slice(0, 50));
    }
  };

  const handleViewOnMap = () => {
    setIsAlertModalOpen(false);
    setActiveTab('map');
    // Pass sector info so MapSection can use it in the copy-to-clipboard string
    setMapCenter({ lat: parseFloat(currentAlert.lat), lng: parseFloat(currentAlert.lng), id: currentAlert.id, sector: currentAlert.sector });
  };

  const handleLogout = () => {
    const confirmed = window.confirm('⚠ Terminate operator session?\n\nAll unsaved settings will be lost. Proceed with logout?');
    if (confirmed) {
      clearToken();
      onLogout();
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-military-bg overflow-hidden military-scanline select-none">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-military-green bg-military-panel flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-military-amber" />
          <h1 className="text-lg font-bold tracking-widest text-white font-sans uppercase">
            BSC-DOP // Command Center
          </h1>
        </div>
        
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={triggerMockAlert}
              className="text-xs font-bold tracking-widest uppercase border border-military-red/40 text-military-red px-3 py-1.5 hover:bg-military-red/10 transition-colors"
            >
              TEST ALERT
            </button>
            <div className="text-military-green text-lg tracking-wider font-mono">
              {format(currentTime, 'HH:mm:ss')} <span className="text-xs ml-1">IST</span>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-military-red hover:bg-military-red/10 px-3 py-1.5 border border-military-red/30 transition-colors"
          >
            <Power className="w-4 h-4" />
            <span className="text-xs font-bold tracking-widest uppercase">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar (15%) */}
        <aside className="w-[15%] min-w-[200px] border-r border-military-green bg-military-panel/80 flex flex-col z-10">
          <div className="p-4 border-b border-military-green/50">
            <h3 className="text-xs text-military-green mb-3 tracking-widest uppercase">System Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">DRONES ONLINE</span>
                <span className="text-military-amber font-bold">{systemHealth.drones_online}/12</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">SAT LINK</span>
                <span className={`font-bold flex items-center gap-1 ${systemHealth.sat_link === 'SECURE' ? 'text-military-green' : 'text-military-red'}`}>
                  {systemHealth.sat_link === 'SECURE' && <span className="w-2 h-2 rounded-full bg-military-green animate-pulse"></span>}
                  {systemHealth.sat_link}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">PWR LEVEL</span>
                <span className="text-white font-bold">{systemHealth.power_level}%</span>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            <h3 className="text-xs text-military-green mb-3 tracking-widest uppercase">Navigation</h3>
            <button
              onClick={() => setActiveTab('cameras')}
              className={`w-full flex items-center gap-3 p-3 text-sm tracking-wider uppercase transition-all border-l-2 ${
                activeTab === 'cameras'
                  ? 'border-military-amber bg-military-green/15 text-white shadow-[inset_3px_0_10px_rgba(245,158,11,0.18)]'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-military-green/5'
              }`}
            >
              <Crosshair className="w-4 h-4" /> Cameras
            </button>
            <button
              onClick={() => setActiveTab('map')}
              className={`w-full flex items-center gap-3 p-3 text-sm tracking-wider uppercase transition-all border-l-2 ${
                activeTab === 'map'
                  ? 'border-military-amber bg-military-green/15 text-white shadow-[inset_3px_0_10px_rgba(245,158,11,0.18)]'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-military-green/5'
              }`}
            >
              <MapIcon className="w-4 h-4" /> Tac-Map
            </button>
            <button
              onClick={() => setActiveTab('alert-history')}
              className={`w-full flex items-center gap-3 p-3 text-sm tracking-wider uppercase transition-all border-l-2 ${
                activeTab === 'alert-history'
                  ? 'border-military-amber bg-military-green/15 text-white shadow-[inset_3px_0_10px_rgba(245,158,11,0.18)]'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-military-green/5'
              }`}
            >
              <ShieldAlert className="w-4 h-4" /> Alert History
            </button>
            <button
              onClick={() => setActiveTab('ai-detection')}
              className={`w-full flex items-center gap-3 p-3 text-sm tracking-wider uppercase transition-all border-l-2 ${
                activeTab === 'ai-detection'
                  ? 'border-green-400 bg-green-400/10 text-green-400 shadow-[inset_3px_0_10px_rgba(74,222,128,0.18)]'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-military-green/5'
              }`}
            >
              <Cpu className="w-4 h-4" /> AI Detection
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 p-3 text-sm tracking-wider uppercase transition-all border-l-2 ${
                activeTab === 'settings'
                  ? 'border-military-amber bg-military-green/15 text-white shadow-[inset_3px_0_10px_rgba(245,158,11,0.18)]'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-military-green/5'
              }`}
            >
              <Settings className="w-4 h-4" /> Settings
            </button>
          </nav>

          <div className="p-4 border-t border-military-green/50 flex items-center gap-3 bg-military-green/5">
            <div className="w-10 h-10 rounded-full border border-military-green flex items-center justify-center bg-black">
              <User className="w-5 h-5 text-military-green" />
            </div>
            <div>
              <div className="text-xs font-bold text-white uppercase tracking-wider">{session?.callSign ?? 'OPERATOR'}</div>
              <div className="text-[10px] text-military-green tracking-widest uppercase">ID: {session?.officerId ?? '---'}</div>
            </div>
          </div>
        </aside>

        {/* Center Main Panel (60%) */}
        <main className="flex-1 w-[60%] flex flex-col relative z-0 overflow-hidden">
          {activeTab === 'cameras' && <CameraGrid />}
          {activeTab === 'map' && <MapSection mapCenter={mapCenter} resolvedAlerts={resolvedAlerts} />}
          {activeTab === 'alert-history' && <AlertHistoryPanel alerts={alerts} resolvedAlerts={resolvedAlerts} toggleResolved={toggleResolved} />}
          {activeTab === 'ai-detection' && <DetectionPanel />}
          {activeTab === 'settings' && <SettingsPanel />}
        </main>

        {/* Right Panel (25%) */}
        <aside className="w-[25%] min-w-[300px] border-l border-military-green bg-military-panel/90 flex flex-col z-10">
          <AlertSystem alerts={alerts} session={session} resolvedAlerts={resolvedAlerts} toggleResolved={toggleResolved} />
        </aside>
      </div>

      {/* Alert Modal Overlay */}
      {isAlertModalOpen && currentAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-military-panel border-2 border-military-red shadow-[0_0_50px_rgba(239,68,68,0.3)] animate-pulse-border relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-military-red animate-pulse"></div>
            
            <div className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-military-red/20 flex items-center justify-center animate-blink">
                  <ShieldAlert className="w-6 h-6 text-military-red" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-military-red uppercase tracking-widest font-sans">
                    ⚠ INTRUSION DETECTED
                  </h2>
                  <p className="text-military-amber text-lg tracking-widest uppercase">
                    SECTOR {currentAlert.sector}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8 bg-black/50 p-4 border border-military-red/30">
                <div>
                  <div className="text-xs text-military-red/70 uppercase tracking-wider mb-1">Threat Type</div>
                  <div className="text-white font-mono">{currentAlert.threat}</div>
                </div>
                <div>
                  <div className="text-xs text-military-red/70 uppercase tracking-wider mb-1">Source</div>
                  <div className="text-white font-mono">{currentAlert.camera}</div>
                </div>
                <div>
                  <div className="text-xs text-military-red/70 uppercase tracking-wider mb-1">Coordinates</div>
                  <div className="text-military-amber font-mono text-lg">
                    {currentAlert.lat}, {currentAlert.lng}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-military-red/70 uppercase tracking-wider mb-1">Timestamp</div>
                  <div className="text-white font-mono">{format(new Date(currentAlert.timestamp), 'HH:mm:ss')}</div>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={handleViewOnMap}
                  className="flex-1 bg-military-red/20 border border-military-red text-military-red py-3 font-bold tracking-widest uppercase hover:bg-military-red hover:text-white transition-all flex justify-center items-center gap-2 group"
                >
                  <MapIcon className="w-5 h-5 group-hover:animate-bounce" />
                  VIEW ON MAP
                </button>
                {/* ── Operation Success tick ── */}
                <button
                  onClick={() => {
                    toggleResolved(currentAlert.id);
                    setIsAlertModalOpen(false);
                  }}
                  className={`flex-1 py-3 font-bold tracking-widest uppercase border transition-all flex justify-center items-center gap-2 ${
                    resolvedAlerts.has(currentAlert.id)
                      ? 'border-military-green bg-military-green/20 text-military-green'
                      : 'border-military-green/40 text-military-green/60 hover:bg-military-green/10 hover:border-military-green hover:text-military-green'
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  {resolvedAlerts.has(currentAlert.id) ? 'RESOLVED ✓' : 'MARK RESOLVED'}
                </button>
                <button 
                  onClick={() => setIsAlertModalOpen(false)}
                  className="px-6 border border-gray-600 text-gray-400 py-3 font-bold tracking-widest uppercase hover:bg-gray-800 hover:text-white transition-colors"
                >
                  DISMISS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Alert History Panel ─────────────────────────────────────────── */
const AlertHistoryPanel = ({ alerts, resolvedAlerts, toggleResolved }) => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'critical' | 'warning'
  const [filterSector, setFilterSector] = useState('all');

  const sectors = ['all', 'ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'];

  const filtered = alerts.filter(a => {
    const matchType   = filterType === 'all'   || a.type   === filterType;
    const matchSector = filterSector === 'all' || a.sector === filterSector;
    const matchSearch = search === '' ||
      a.threat.toLowerCase().includes(search.toLowerCase()) ||
      a.sector.toLowerCase().includes(search.toLowerCase()) ||
      a.camera.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSector && matchSearch;
  });

  return (
    <div className="w-full h-full flex flex-col bg-military-bg overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-military-green bg-military-panel">
        <h2 className="text-sm font-bold tracking-widest text-military-amber uppercase flex items-center gap-2 mb-4">
          <ShieldAlert className="w-4 h-4" /> Alert History Log
          <span className="ml-auto text-xs text-gray-500 font-mono">{filtered.length} / {alerts.length} records</span>
        </h2>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search threats, sectors, cameras..."
            className="w-full bg-black border border-military-green/40 text-white text-xs font-mono pl-8 pr-3 py-2 placeholder-gray-600 focus:outline-none focus:border-military-green tracking-wide"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Filter className="w-3 h-3 text-gray-500" />
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Type:</span>
          </div>
          {['all', 'critical', 'warning'].map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`text-[10px] px-2 py-0.5 border uppercase tracking-widest transition-colors ${
                filterType === t
                  ? t === 'critical' ? 'border-military-red bg-military-red/20 text-military-red'
                    : t === 'warning' ? 'border-military-amber bg-military-amber/20 text-military-amber'
                    : 'border-military-green bg-military-green/20 text-military-green'
                  : 'border-gray-700 text-gray-500 hover:border-gray-500'
              }`}
            >{t}</button>
          ))}
          <span className="text-gray-700">|</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Sector:</span>
          </div>
          {sectors.map(s => (
            <button
              key={s}
              onClick={() => setFilterSector(s)}
              className={`text-[10px] px-2 py-0.5 border uppercase tracking-widest transition-colors ${
                filterSector === s
                  ? 'border-military-amber bg-military-amber/20 text-military-amber'
                  : 'border-gray-700 text-gray-500 hover:border-gray-500'
              }`}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <ShieldAlert className="w-12 h-12 mb-3 opacity-20" />
            <span className="text-xs font-mono uppercase tracking-widest">
              {alerts.length === 0 ? 'No alerts recorded yet' : 'No results match filters'}
            </span>
          </div>
        ) : (
          <table className="w-full text-xs font-mono border-collapse">
            <thead className="sticky top-0 bg-military-panel border-b border-military-green/40">
              <tr>
                {['', 'Time', 'Type', 'Sector', 'Threat', 'Source', 'Coords'].map(h => (
                  <th key={h} className="text-left text-[10px] text-military-green tracking-widest uppercase px-3 py-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((alert, i) => {
                const resolved = resolvedAlerts.has(alert.id);
                return (
                  <tr
                    key={alert.id}
                    className={`border-b border-military-green/10 transition-colors hover:bg-military-green/5 ${
                      resolved ? 'opacity-60' : i % 2 === 0 ? 'bg-black/20' : ''
                    }`}
                  >
                    {/* ── Resolved checkbox ── */}
                    <td className="px-3 py-2">
                      <button
                        onClick={() => toggleResolved(alert.id)}
                        title={resolved ? 'Mark as unresolved' : 'Mark operation resolved'}
                        className="group flex items-center justify-center"
                      >
                        {resolved
                          ? <CheckCircle2 className="w-4 h-4 text-military-green" />
                          : <Circle className="w-4 h-4 text-gray-600 group-hover:text-military-green/60 transition-colors" />
                        }
                      </button>
                    </td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{format(new Date(alert.timestamp), 'HH:mm:ss')}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 border uppercase tracking-wider text-[9px] ${
                        resolved
                          ? 'border-military-green/40 text-military-green/70 bg-military-green/10'
                          : alert.type === 'critical'
                            ? 'border-military-red/60 text-military-red bg-military-red/10'
                            : 'border-military-amber/60 text-military-amber bg-military-amber/10'
                      }`}>
                        {resolved ? 'resolved' : alert.type}
                      </span>
                    </td>
                    <td className={`px-3 py-2 tracking-widest ${resolved ? 'text-gray-500 line-through' : 'text-white'}`}>{alert.sector}</td>
                    <td className={`px-3 py-2 ${resolved ? 'text-gray-500' : 'text-gray-300'}`}>{alert.threat}</td>
                    <td className={`px-3 py-2 ${resolved ? 'text-gray-600' : 'text-military-green'}`}>{alert.camera}</td>
                    <td className={`px-3 py-2 ${resolved ? 'text-gray-600' : 'text-military-amber'}`}>{alert.lat}, {alert.lng}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

/* ─── Settings Panel ──────────────────────────────────────────────── */
const SettingsPanel = () => {
  const defaults = {
    dronesOnline: 12,
    alertSensitivity: 75,
    scanInterval: 5,
    audioAlerts: true,
    autoTrack: true,
    nightVision: false,
    encryptionLevel: 'AES-256',
    operatorId: 'IND-8839',
    callSign: 'CMDR. RAJPUT',
    streamQuality: 'HD',
  };

  const [config, setConfig] = useState(defaults);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Map backend snake_case keys to camelCase for the UI
  const fromApi = (d) => ({
    dronesOnline: d.drones_online,
    alertSensitivity: d.alert_sensitivity,
    scanInterval: d.scan_interval,
    audioAlerts: d.audio_alerts,
    autoTrack: d.auto_track,
    nightVision: d.night_vision,
    encryptionLevel: d.encryption_level,
    streamQuality: d.stream_quality,
    operatorId: defaults.operatorId,
    callSign: defaults.callSign,
  });

  const toApi = (c) => ({
    drones_online: c.dronesOnline,
    alert_sensitivity: c.alertSensitivity,
    scan_interval: c.scanInterval,
    audio_alerts: c.audioAlerts,
    auto_track: c.autoTrack,
    night_vision: c.nightVision,
    encryption_level: c.encryptionLevel,
    stream_quality: c.streamQuality,
  });

  useEffect(() => {
    fetchSettings()
      .then(d => setConfig(fromApi(d)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const update = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  const saveSettings = async () => {
    try {
      const updated = await updateSettings(toApi(config));
      setConfig(fromApi(updated));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('Settings save failed', err);
    }
  };

  const resetSettings = async () => {
    try {
      const updated = await updateSettings(toApi(defaults));
      setConfig(fromApi(updated));
    } catch {
      setConfig(defaults);
    }
  };

  const Toggle = ({ value, onChange }) => (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 border transition-colors ${
        value ? 'bg-military-green/30 border-military-green' : 'bg-black border-gray-600'
      }`}
    >
      <span className={`absolute top-0.5 w-4 h-4 transition-all ${
        value ? 'left-5 bg-military-green' : 'left-0.5 bg-gray-600'
      }`} />
    </button>
  );

  const Section = ({ title, icon: Icon, children }) => (
    <div className="mb-6">
      <h3 className="text-[10px] text-military-green tracking-widest uppercase flex items-center gap-2 mb-3 pb-2 border-b border-military-green/20">
        <Icon className="w-3 h-3" /> {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  );

  const Row = ({ label, children }) => (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400 tracking-wider uppercase">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col bg-military-bg overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-military-green bg-military-panel flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-widest text-military-amber uppercase flex items-center gap-2">
          <Settings className="w-4 h-4" /> System Configuration
        </h2>
        <div className="flex gap-2">
          <button
            onClick={resetSettings}
            className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 transition-colors uppercase tracking-widest"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button
            onClick={saveSettings}
            className={`flex items-center gap-1.5 text-[10px] px-3 py-1.5 border uppercase tracking-widest transition-all ${
              saved
                ? 'border-military-green bg-military-green/20 text-military-green'
                : 'border-military-amber text-military-amber hover:bg-military-amber/10'
            }`}
          >
            <Save className="w-3 h-3" /> {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 font-mono">
        <Section title="Drone Operations" icon={Radio}>
          <Row label="Drones Online">
            <input
              type="number" min={0} max={20}
              value={config.dronesOnline}
              onChange={e => update('dronesOnline', Number(e.target.value))}
              className="w-16 bg-black border border-military-green/40 text-military-amber text-xs text-center py-1 focus:outline-none focus:border-military-green"
            />
            <span className="text-[10px] text-gray-600">/ 20</span>
          </Row>
          <Row label="Scan Interval (s)">
            <input
              type="range" min={1} max={30}
              value={config.scanInterval}
              onChange={e => update('scanInterval', Number(e.target.value))}
              className="w-28 accent-military-amber"
            />
            <span className="text-xs text-military-amber w-6 text-right">{config.scanInterval}s</span>
          </Row>
          <Row label="Stream Quality">
            {['SD', 'HD', '4K'].map(q => (
              <button
                key={q}
                onClick={() => update('streamQuality', q)}
                className={`text-[10px] px-2 py-0.5 border uppercase tracking-wider transition-colors ${
                  config.streamQuality === q
                    ? 'border-military-amber bg-military-amber/20 text-military-amber'
                    : 'border-gray-700 text-gray-500 hover:border-gray-500'
                }`}
              >{q}</button>
            ))}
          </Row>
        </Section>

        <Section title="Alert Configuration" icon={Sliders}>
          <Row label="Alert Sensitivity">
            <input
              type="range" min={0} max={100}
              value={config.alertSensitivity}
              onChange={e => update('alertSensitivity', Number(e.target.value))}
              className="w-28 accent-military-red"
            />
            <span className="text-xs text-military-red w-8 text-right">{config.alertSensitivity}%</span>
          </Row>
          <Row label="Audio Alerts">
            <Toggle value={config.audioAlerts} onChange={v => update('audioAlerts', v)} />
            <span className="text-[10px] text-gray-500">{config.audioAlerts ? 'ON' : 'OFF'}</span>
          </Row>
          <Row label="Auto Track">
            <Toggle value={config.autoTrack} onChange={v => update('autoTrack', v)} />
            <span className="text-[10px] text-gray-500">{config.autoTrack ? 'ON' : 'OFF'}</span>
          </Row>
        </Section>

        <Section title="Display" icon={Sun}>
          <Row label="Night Vision Mode">
            <Toggle value={config.nightVision} onChange={v => update('nightVision', v)} />
            <span className="text-[10px] text-gray-500">{config.nightVision ? 'ACTIVE' : 'STANDBY'}</span>
          </Row>
        </Section>

        <Section title="Operator Profile" icon={User}>
          <Row label="Call Sign">
            <input
              type="text"
              value={config.callSign}
              onChange={e => update('callSign', e.target.value)}
              className="bg-black border border-military-green/40 text-white text-xs px-2 py-1 w-36 focus:outline-none focus:border-military-green tracking-wider uppercase"
            />
          </Row>
          <Row label="Operator ID">
            <input
              type="text"
              value={config.operatorId}
              onChange={e => update('operatorId', e.target.value)}
              className="bg-black border border-military-green/40 text-white text-xs px-2 py-1 w-36 focus:outline-none focus:border-military-green tracking-wider"
            />
          </Row>
          <Row label="Encryption">
            {['AES-128', 'AES-256', 'AES-512'].map(enc => (
              <button
                key={enc}
                onClick={() => update('encryptionLevel', enc)}
                className={`text-[9px] px-2 py-0.5 border uppercase tracking-wider transition-colors ${
                  config.encryptionLevel === enc
                    ? 'border-military-green bg-military-green/20 text-military-green'
                    : 'border-gray-700 text-gray-500 hover:border-gray-500'
                }`}
              >{enc}</button>
            ))}
          </Row>
        </Section>

        {/* System Info */}
        <div className="mt-4 p-3 bg-black/40 border border-military-green/20 text-[10px] text-gray-600 font-mono space-y-1">
          <div className="flex justify-between"><span>BSC-DOP VERSION</span><span className="text-gray-500">v2.4.1-ALPHA</span></div>
          <div className="flex justify-between"><span>BUILD</span><span className="text-gray-500">2025.05.14</span></div>
          <div className="flex justify-between"><span>CLASSIFICATION</span><span className="text-military-red">TOP SECRET</span></div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
