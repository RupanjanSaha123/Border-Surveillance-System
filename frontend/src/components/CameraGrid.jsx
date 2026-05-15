import React, { useState, useEffect } from 'react';
import { Camera, Maximize2, Minimize2, Wifi, Activity, Lock, Edit3, Check,
         Crosshair, Thermometer, Wind, Battery, Signal, ShieldAlert, Eye } from 'lucide-react';
import { format } from 'date-fns';

/* ─── Camera definitions ─────────────────────────────────────────────────── */
const cameras = [
  { id: 1, name: 'CAM-01', sector: 'SECTOR ALPHA',   ip: 'rtsp://10.0.0.1/stream1', lat: 32.4512, lng: 75.6831, alt: 450, drone: 'DRONE-ALPHA'   },
  { id: 2, name: 'CAM-02', sector: 'SECTOR BRAVO',   ip: 'rtsp://10.0.0.2/stream1', lat: 32.4889, lng: 75.7102, alt: 420, drone: 'DRONE-BRAVO'   },
  { id: 3, name: 'CAM-03', sector: 'SECTOR CHARLIE', ip: 'rtsp://10.0.0.3/stream1', lat: 32.4210, lng: 75.6540, alt: 510, drone: 'DRONE-CHARLIE' },
  { id: 4, name: 'CAM-04', sector: 'SECTOR DELTA',   ip: 'rtsp://10.0.0.4/stream1', lat: 32.5003, lng: 75.7380, alt: 390, drone: 'DRONE-DELTA'   },
];

/* ─── Small stat box used in the maximized HUD ───────────────────────────── */
const StatBox = ({ label, value, unit, icon: Icon, color = 'text-military-amber' }) => (
  <div className="flex flex-col bg-black border border-military-green/20 px-3 py-2 min-w-[90px]">
    <div className="flex items-center gap-1 mb-1">
      {Icon && <Icon className={`w-3 h-3 ${color}`} />}
      <span className="text-[9px] text-gray-500 uppercase tracking-widest">{label}</span>
    </div>
    <div className={`font-mono text-sm font-bold ${color}`}>
      {value}<span className="text-[10px] text-gray-600 ml-0.5">{unit}</span>
    </div>
  </div>
);

/* ─── CameraFeed ──────────────────────────────────────────────────────────── */
const CameraFeed = ({ cam, isPinned, onTogglePin }) => {
  const [streamIp, setStreamIp]   = useState(cam.ip);
  const [editingIp, setEditingIp] = useState(false);
  const [draftIp, setDraftIp]     = useState(cam.ip);
  const [clock, setClock]         = useState(new Date());

  // Live GPS drift simulation
  const [gps, setGps] = useState({ lat: cam.lat, lng: cam.lng });

  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const gpsTimer = setInterval(() => {
      setGps({
        lat: parseFloat((cam.lat + (Math.random() - 0.5) * 0.002).toFixed(4)),
        lng: parseFloat((cam.lng + (Math.random() - 0.5) * 0.002).toFixed(4)),
      });
    }, 3000);
    return () => clearInterval(gpsTimer);
  }, [cam.lat, cam.lng]);

  // Mock fluctuating telemetry for maximized view
  const [telemetry, setTelemetry] = useState({
    signal: 98, battery: 87, temp: 34, wind: 12, threat: 'CLEAR',
  });
  useEffect(() => {
    if (!isPinned) return;
    const t = setInterval(() => {
      setTelemetry(prev => ({
        signal:  Math.max(60, Math.min(100, prev.signal  + Math.round((Math.random() - 0.5) * 4))),
        battery: Math.max(10, Math.min(100, prev.battery - Math.round(Math.random() * 0.3))),
        temp:    Math.max(20, Math.min(55,  prev.temp    + Math.round((Math.random() - 0.5) * 2))),
        wind:    Math.max(0,  Math.min(40,  prev.wind    + Math.round((Math.random() - 0.5) * 3))),
        threat:  prev.threat,
      }));
    }, 2500);
    return () => clearInterval(t);
  }, [isPinned]);

  const handleSaveIp = () => {
    if (/^(rtsp|https?):\/\/.+/.test(draftIp)) {
      setStreamIp(draftIp);
    } else {
      setDraftIp(streamIp);
    }
    setEditingIp(false);
  };

  /* ── shared feed viewport ── */
  const FeedViewport = () => (
    <div
      className="relative overflow-hidden bg-[#050805] flex items-center justify-center cursor-pointer military-scanline"
      style={{ flex: isPinned ? '1 1 0' : undefined, minHeight: 0 }}
      onClick={() => onTogglePin(cam.id)}
    >
      {/* Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(74,103,65,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(74,103,65,0.1)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Center Reticle */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 opacity-20 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-8 bg-military-green" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-8 bg-military-green" />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-8 h-px bg-military-green" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-px bg-military-green" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-military-green" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-military-green rounded-full" />
      </div>

      {/* Maximized: extra corner HUD overlays on the feed itself */}
      {isPinned && (
        <>
          {/* top-left GPS overlay on feed */}
          <div className="absolute top-3 left-3 bg-black/70 border border-military-green/40 px-2 py-1 backdrop-blur-sm pointer-events-none z-10">
            <div className="text-[9px] text-military-green tracking-widest uppercase flex items-center gap-1 mb-0.5">
              <Crosshair className="w-2.5 h-2.5" /> Live GPS
            </div>
            <div className="text-military-amber font-mono text-xs">{gps.lat.toFixed(4)} N</div>
            <div className="text-military-amber font-mono text-xs">{gps.lng.toFixed(4)} E</div>
          </div>

          {/* top-right threat status on feed */}
          <div className="absolute top-3 right-3 bg-black/70 border border-military-green/40 px-2 py-1 backdrop-blur-sm pointer-events-none z-10 flex items-center gap-1.5">
            <ShieldAlert className={`w-3 h-3 ${telemetry.threat === 'CLEAR' ? 'text-military-green' : 'text-military-red animate-pulse'}`} />
            <span className={`text-[10px] font-bold font-mono tracking-widest ${telemetry.threat === 'CLEAR' ? 'text-military-green' : 'text-military-red'}`}>
              {telemetry.threat}
            </span>
          </div>

          {/* bottom-left alt overlay on feed */}
          <div className="absolute bottom-3 left-3 bg-black/70 border border-military-green/40 px-2 py-1 backdrop-blur-sm pointer-events-none z-10">
            <span className="text-[9px] text-gray-400 font-mono">ALT: </span>
            <span className="text-military-amber font-mono text-xs font-bold">{cam.alt}m</span>
          </div>

          {/* bottom-right timestamp on feed */}
          <div className="absolute bottom-3 right-3 bg-black/70 border border-military-green/40 px-2 py-1 backdrop-blur-sm pointer-events-none z-10">
            <span className="text-military-green font-mono text-xs tracking-wider">{format(clock, 'HH:mm:ss')}</span>
            <span className="text-[9px] text-gray-500 ml-1">IST</span>
          </div>
        </>
      )}

      <Camera className="w-12 h-12 text-military-green/20" />
    </div>
  );

  /* ─── GRID MODE footer (compact, shows lat/lng) ──────────────────── */
  const GridFooter = () => (
    <div className="h-14 flex flex-col justify-end bg-black mt-1 px-1 shrink-0">
      {/* Stream IP row */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-military-green uppercase tracking-widest shrink-0">IP:</span>
        {editingIp ? (
          <>
            <input
              type="text"
              value={draftIp}
              onChange={(e) => setDraftIp(e.target.value)}
              className="flex-1 bg-military-amber/10 border border-military-amber/50 text-[10px] text-white font-mono px-2 py-0.5 focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveIp();
                if (e.key === 'Escape') { setDraftIp(streamIp); setEditingIp(false); }
              }}
            />
            <button onClick={handleSaveIp} title="Save" className="text-military-green hover:text-white transition-colors">
              <Check className="w-3 h-3" />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-[10px] text-white font-mono truncate">{streamIp}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setDraftIp(streamIp); setEditingIp(true); }}
              title="Edit stream IP"
              className="text-gray-600 hover:text-military-amber transition-colors"
            >
              <Edit3 className="w-3 h-3" />
            </button>
          </>
        )}
      </div>

      {/* Stats row: signal | alt | lat/lng | clock */}
      <div className="flex justify-between items-center text-[9px] text-gray-500 font-mono tracking-wider border-t border-military-green/20 pt-1">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1"><Wifi className="w-3 h-3 text-military-green" /> 98%</span>
          <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-military-amber" /> {cam.alt}m</span>
        </div>
        {/* ← lat/lng always visible in grid mode */}
        <span className="text-military-amber tracking-wider">
          {gps.lat.toFixed(4)}N, {gps.lng.toFixed(4)}E
        </span>
        <span className="flex items-center gap-1">
          {editingIp && <Lock className="w-2 h-2 text-military-amber" />}
          {format(clock, 'HH:mm:ss')}
        </span>
      </div>
    </div>
  );

  /* ─── MAXIMIZED MODE bottom HUD panel ───────────────────────────── */
  const MaximizedHUD = () => (
    <div className="shrink-0 bg-black border-t border-military-green/40">
      {/* Row 1: stat boxes */}
      <div className="flex items-stretch gap-0 border-b border-military-green/20 overflow-x-auto">
        <StatBox label="Latitude"  value={`${gps.lat.toFixed(4)}`} unit="N"   icon={Crosshair}   color="text-military-amber" />
        <StatBox label="Longitude" value={`${gps.lng.toFixed(4)}`} unit="E"   icon={Crosshair}   color="text-military-amber" />
        <StatBox label="Altitude"  value={cam.alt}                 unit="m"   icon={Activity}    color="text-military-green" />
        <StatBox label="Signal"    value={telemetry.signal}        unit="%"   icon={Signal}      color={telemetry.signal > 75 ? 'text-military-green' : 'text-military-red'} />
        <StatBox label="Battery"   value={telemetry.battery}       unit="%"   icon={Battery}     color={telemetry.battery > 30 ? 'text-military-amber' : 'text-military-red'} />
        <StatBox label="Temp"      value={telemetry.temp}          unit="°C"  icon={Thermometer} color="text-sky-400" />
        <StatBox label="Wind"      value={telemetry.wind}          unit="m/s" icon={Wind}        color="text-gray-300" />
        {/* Stream IP inline editor in maximized footer */}
        <div className="flex flex-col bg-black border border-military-green/20 px-3 py-2 flex-1 min-w-[140px]">
          <span className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Stream IP</span>
          {editingIp ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={draftIp}
                onChange={(e) => setDraftIp(e.target.value)}
                className="flex-1 bg-military-amber/10 border border-military-amber/50 text-[10px] text-white font-mono px-1 focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveIp();
                  if (e.key === 'Escape') { setDraftIp(streamIp); setEditingIp(false); }
                }}
              />
              <button onClick={handleSaveIp} className="text-military-green"><Check className="w-3 h-3" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-white truncate flex-1">{streamIp}</span>
              <button
                onClick={(e) => { e.stopPropagation(); setDraftIp(streamIp); setEditingIp(true); }}
                className="text-gray-600 hover:text-military-amber transition-colors"
              >
                <Edit3 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: drone info + timestamp */}
      <div className="flex items-center justify-between px-4 py-2 text-[10px] font-mono">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-military-green">
            <Eye className="w-3 h-3" /> {cam.drone}
          </span>
          <span className="text-gray-500">{cam.sector}</span>
          <span className="text-gray-600">{streamIp}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1 font-bold tracking-widest ${telemetry.threat === 'CLEAR' ? 'text-military-green' : 'text-military-red'}`}>
            <ShieldAlert className="w-3 h-3" /> {telemetry.threat}
          </span>
          <span className="text-military-green tracking-wider">{format(clock, 'HH:mm:ss')} IST</span>
        </div>
      </div>
    </div>
  );

  /* ─── render ─────────────────────────────────────────────────────── */
  return (
    <div className={`relative flex flex-col bg-black border border-military-green/50 p-1 group transition-all duration-300 ${isPinned ? 'w-full h-full' : 'w-full h-full'}`}>
      {/* Decorative Corner Brackets */}
      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-military-green opacity-50 z-10 pointer-events-none" />
      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-military-green opacity-50 z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-military-green opacity-50 z-10 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-military-green opacity-50 z-10 pointer-events-none" />

      {/* Header bar */}
      <div className="absolute top-2 left-2 right-2 flex justify-between items-start z-10">
        <div className="flex items-center gap-2 bg-black/60 px-2 py-1 border border-military-green/30 backdrop-blur-sm">
          <div className="w-2 h-2 rounded-full bg-military-red animate-blink" />
          <span className="text-xs text-white font-bold tracking-widest uppercase">LIVE</span>
          <span className="text-[10px] text-military-green font-mono ml-2">{cam.name} — {cam.sector}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(cam.id); }}
          className="bg-black/60 p-1 border border-military-green/30 text-military-green hover:text-military-amber hover:border-military-amber transition-colors backdrop-blur-sm"
        >
          {isPinned ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Feed viewport — takes all remaining vertical space */}
      <div className={`flex-1 min-h-0 mt-1`}>
        <FeedViewport />
      </div>

      {/* Footer — switches based on mode */}
      {isPinned ? <MaximizedHUD /> : <GridFooter />}
    </div>
  );
};

/* ─── CameraGrid ──────────────────────────────────────────────────────────── */
const CameraGrid = () => {
  const [pinnedCamId, setPinnedCamId] = useState(null);

  const togglePin = (id) => {
    setPinnedCamId(prev => (prev === id ? null : id));
  };

  return (
    <div className="w-full h-full p-4 flex flex-col bg-military-panel/50">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h2 className="text-sm font-bold text-military-green tracking-widest uppercase font-sans">
          Tactical Feeds
        </h2>
        <div className="text-xs text-gray-400 font-mono">
          {pinnedCamId ? `MODE: SINGLE FEED — MAXIMIZED` : 'MODE: 2×2 GRID PATROL'}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {pinnedCamId ? (
          <CameraFeed
            cam={cameras.find(c => c.id === pinnedCamId)}
            isPinned={true}
            onTogglePin={togglePin}
          />
        ) : (
          <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-3">
            {cameras.map(cam => (
              <CameraFeed
                key={cam.id}
                cam={cam}
                isPinned={false}
                onTogglePin={togglePin}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraGrid;
