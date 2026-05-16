import React, { useState, useEffect, useCallback, memo } from 'react';
import { Camera, Maximize2, Minimize2, Wifi, Activity, Lock, Edit3, Check,
         Crosshair, Thermometer, Wind, Battery, Signal, ShieldAlert, Eye, Cpu, Flame } from 'lucide-react';
import { format } from 'date-fns';
import { subscribeDrones, registerAICamera, unregisterAICamera, getAIStreamUrl, subscribeDetections } from '../api';

/* ─── Camera definitions ─────────────────────────────────────────────────── */
const initialCameras = [
  { id: 1, name: 'CAM-01', sector: 'SECTOR ALPHA',   ip: 'http://10.91.115.108:8080/video', lat: 32.4512, lng: 75.6831, alt: 450, drone: 'DRONE-ALPHA'   },
  { id: 2, name: 'CAM-02', sector: 'SECTOR BRAVO',   ip: 'rtsp://10.0.0.1/stream1', lat: 32.4889, lng: 75.7102, alt: 420, drone: 'DRONE-BRAVO'   },
  { id: 3, name: 'CAM-03', sector: 'SECTOR CHARLIE', ip: 'rtsp://10.0.0.1/stream1', lat: 32.4210, lng: 75.6540, alt: 510, drone: 'DRONE-CHARLIE' },
  { id: 4, name: 'CAM-04', sector: 'SECTOR DELTA',   ip: 'rtsp://10.0.0.1/stream1', lat: 32.5003, lng: 75.7380, alt: 390, drone: 'DRONE-DELTA'   },
];

/* ─── Isolated Clock Component ─────────────────────────────────────────── */
const ClockDisplay = memo(({ className = "" }) => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className={className}>{format(time, 'HH:mm:ss')}</span>;
});

/* ─── StatBox Component ────────────────────────────────────────────────── */
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
const CameraFeed = ({ cam, isPinned, onTogglePin, droneData, streamIp, onUpdateIp, aiEnabled, onToggleAI, aiDetections }) => {
  const [editingIp, setEditingIp] = useState(false);
  const [draftIp, setDraftIp]     = useState(streamIp);
  const [feedError, setFeedError] = useState(false);

  // Sync draft with streamIp if not editing
  useEffect(() => {
    if (!editingIp) {
      setDraftIp(streamIp);
      setFeedError(false); // Reset error when IP changes
    }
  }, [streamIp, editingIp]);

  const telemetry = droneData || {
    signal: 0, battery: 0, temp: 0, wind: 0, threat: 'N/A',
    lat: 0, lng: 0, alt: 0
  };

  const isConnected = !!streamIp && streamIp.trim() !== '';
  const hasRealData = !!droneData && droneData.status === 'REALTIME';

  const gps = hasRealData 
    ? { lat: telemetry.lat, lng: telemetry.lng }
    : { lat: 0, lng: 0 };

  const handleSaveIp = () => {
    let finalIp = draftIp.trim();
    
    // Auto-fix common mobile camera app mistakes
    // If it's just an IP like 10.x.x.x or 192.x.x.x, suggest adding :8080/video
    const ipRegex = /^(?:http:\/\/)?\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    if (ipRegex.test(finalIp)) {
      const confirmed = window.confirm(
        `Your URL "${finalIp}" looks like a direct IP. \n\n` +
        `Most mobile camera apps (like IP Webcam) require a port and path, usually: \n` +
        `"${finalIp}:8080/video" \n\n` +
        `Would you like to use this corrected URL instead?`
      );
      if (confirmed) {
        if (!finalIp.startsWith('http')) finalIp = 'http://' + finalIp;
        finalIp = finalIp + ':8080/video';
        setDraftIp(finalIp);
      }
    }

    if (finalIp !== streamIp) {
      onUpdateIp(cam.id, finalIp);
    }
    setEditingIp(false);
  };

  return (
    <div className="relative flex flex-col bg-black border border-military-green/50 p-1 group w-full h-full min-h-0">
      {/* ── Viewport Header ── */}
      <div className="absolute top-2 left-2 right-2 flex justify-between items-start z-10 pointer-events-none">
        <div className="flex items-center gap-2 bg-black/60 px-2 py-1 border border-military-green/30 backdrop-blur-sm">
          <div className={`w-2 h-2 rounded-full ${aiEnabled ? 'bg-green-400' : 'bg-military-red'} animate-blink`} />
          <span className="text-xs text-white font-bold tracking-widest uppercase">{aiEnabled ? 'AI' : 'LIVE'}</span>
          <span className="text-[10px] text-military-green font-mono ml-2">{cam.name} — {cam.sector}</span>
          {/* AI Detection Badges */}
          {aiEnabled && aiDetections && (
            <div className="flex items-center gap-1 ml-2">
              {aiDetections.humans > 0 && <span className="text-[9px] px-1 bg-green-500/20 border border-green-500/40 text-green-400 font-mono">H:{aiDetections.humans}</span>}
              {aiDetections.vehicles > 0 && <span className="text-[9px] px-1 bg-blue-500/20 border border-blue-500/40 text-blue-400 font-mono">V:{aiDetections.vehicles}</span>}
              {aiDetections.fire && <span className="text-[9px] px-1 bg-red-500/20 border border-red-500/40 text-red-400 font-mono animate-pulse">🔥</span>}
              {aiDetections.weapons > 0 && <span className="text-[9px] px-1 bg-red-500/20 border border-red-500/40 text-red-400 font-mono animate-pulse">⚠W:{aiDetections.weapons}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 pointer-events-auto">
          {/* AI Toggle Button */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleAI(cam); }}
            title={aiEnabled ? 'Disable AI Detection' : 'Enable AI Detection'}
            className={`bg-black/60 p-1 border backdrop-blur-sm transition-colors ${
              aiEnabled
                ? 'border-green-400/50 text-green-400 hover:bg-green-400/20'
                : 'border-military-green/30 text-gray-500 hover:text-military-amber hover:border-military-amber'
            }`}
          >
            <Cpu className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePin(cam.id); }}
            className="bg-black/60 p-1 border border-military-green/30 text-military-green hover:text-military-amber hover:border-military-amber transition-colors backdrop-blur-sm"
          >
            {isPinned ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Feed Viewport ── */}
      <div className="flex-1 min-h-0 mt-1 relative w-full h-full">
        <div
          className="relative w-full h-full overflow-hidden bg-[#050805] flex items-center justify-center cursor-pointer military-scanline"
          onClick={() => onTogglePin(cam.id)}
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(74,103,65,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(74,103,65,0.1)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

          {isConnected && !feedError ? (
            <img 
              key={aiEnabled ? `ai-${cam.name}` : streamIp}
              src={aiEnabled
                ? getAIStreamUrl(cam.name)
                : (streamIp.includes('/api/cameras/stream') 
                  ? streamIp 
                  : `${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/api/cameras/stream?url=${encodeURIComponent(streamIp)}`
                )
              } 
              alt="Feed" 
              className="absolute inset-0 w-full h-full object-cover z-0"
              onError={() => setFeedError(true)}
              onLoad={() => setFeedError(false)}
            />
          ) : null}

          {( !isConnected || feedError ) && (
            <div className="flex flex-col items-center gap-2 opacity-40 z-10 animate-pulse">
              <Wifi className="w-12 h-12 text-military-red" />
              <span className="text-[10px] text-military-red font-bold tracking-widest uppercase">
                {feedError ? 'CONNECTION LOST' : 'NO SIGNAL'}
              </span>
              <span className="text-[8px] text-gray-500 font-mono mt-1">{streamIp}</span>
            </div>
          )}

          {isConnected && !feedError && (
            <Camera className="w-12 h-12 text-military-green/10 z-10 pointer-events-none" />
          )}

          {isPinned && (
            <div className="absolute top-3 right-3 bg-black/70 border border-military-green/40 px-2 py-1 backdrop-blur-sm pointer-events-none z-20 flex items-center gap-1.5">
              <ShieldAlert className={`w-3 h-3 ${telemetry.threat === 'CLEAR' ? 'text-military-green' : 'text-military-red animate-pulse'}`} />
              <span className={`text-[10px] font-bold font-mono tracking-widest ${telemetry.threat === 'CLEAR' ? 'text-military-green' : 'text-military-red'}`}>
                {hasRealData ? telemetry.threat : 'OFFLINE'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer / HUD ── */}
      {isPinned ? (
        <div className="shrink-0 bg-black border-t border-military-green/40">
          <div className="flex items-stretch gap-0 border-b border-military-green/20 overflow-x-auto">
            <StatBox label="Latitude"  value={`${gps.lat.toFixed(4)}`} unit="N"   icon={Crosshair}   color={hasRealData ? 'text-military-amber' : 'text-gray-600'} />
            <StatBox label="Longitude" value={`${gps.lng.toFixed(4)}`} unit="E"   icon={Crosshair}   color={hasRealData ? 'text-military-amber' : 'text-gray-600'} />
            <StatBox label="Altitude"  value={hasRealData ? telemetry.alt : 0} unit="m" icon={Activity}    color={hasRealData ? 'text-military-green' : 'text-gray-600'} />
            <StatBox label="Signal"    value={hasRealData ? telemetry.signal : 0} unit="%"   icon={Signal}      color={hasRealData ? (telemetry.signal > 75 ? 'text-military-green' : 'text-military-red') : 'text-gray-600'} />
            <StatBox label="Battery"   value={hasRealData ? Math.round(telemetry.battery) : 0} unit="%"   icon={Battery}     color={hasRealData ? (telemetry.battery > 30 ? 'text-military-amber' : 'text-military-red') : 'text-gray-600'} />
            <StatBox label="Temp"      value={hasRealData ? telemetry.temp : 0} unit="°C"  icon={Thermometer} color={hasRealData ? 'text-sky-400' : 'text-gray-600'} />
            <StatBox label="Wind"      value={hasRealData ? telemetry.wind : 0} unit="m/s" icon={Wind}        color={hasRealData ? 'text-gray-300' : 'text-gray-600'} />
            
            <div 
              className="flex flex-col bg-black border border-military-green/20 px-3 py-2 flex-1 min-w-[140px] cursor-pointer hover:bg-military-green/5 transition-colors"
              onClick={() => !editingIp && setEditingIp(true)}
            >
              <span className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Stream IP</span>
              {editingIp ? (
                <input
                  type="text"
                  value={draftIp}
                  onChange={(e) => setDraftIp(e.target.value)}
                  className="bg-military-amber/10 border border-military-amber/50 text-[10px] text-white font-mono px-1 focus:outline-none"
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveIp();
                    if (e.key === 'Escape') { setEditingIp(false); }
                  }}
                  onBlur={handleSaveIp}
                />
              ) : (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[10px] text-white truncate flex-1">{streamIp || 'NO URL SET'}</span>
                  <Edit3 className="w-3 h-3 text-gray-600" />
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2 text-[10px] font-mono">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-military-green"><Eye className="w-3 h-3" /> {cam.drone}</span>
              <span className="text-gray-500">{cam.sector}</span>
              <span className="text-gray-600 truncate max-w-[150px]">{streamIp}</span>
            </div>
            <div className="flex items-center gap-1 text-military-green font-bold">
              <ClockDisplay /> <span>IST</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-16 flex flex-col justify-end bg-black mt-1 px-2 pb-1 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-military-green uppercase tracking-widest shrink-0">IP:</span>
            {editingIp ? (
              <input
                type="text"
                value={draftIp}
                onChange={(e) => setDraftIp(e.target.value)}
                className="flex-1 bg-military-amber/10 border border-military-amber/50 text-[10px] text-white font-mono px-2 py-0.5 focus:outline-none"
                autoFocus
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveIp();
                  if (e.key === 'Escape') { setEditingIp(false); }
                }}
                onBlur={handleSaveIp}
              />
            ) : (
              <>
                <span className={`flex-1 text-[10px] font-mono truncate ${isConnected ? 'text-white' : 'text-military-red/50 italic'}`}>
                  {isConnected ? streamIp : 'NOT CONNECTED'}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingIp(true); }}
                  className="text-gray-600 hover:text-military-amber transition-colors"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
          <div className="flex justify-between items-center text-[9px] text-gray-500 font-mono tracking-wider border-t border-military-green/20 pt-1">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <Wifi className={`w-3 h-3 ${hasRealData ? 'text-military-green' : 'text-gray-700'}`} /> 
                {hasRealData ? `${telemetry.signal}%` : '0%'}
              </span>
              <span className="flex items-center gap-1">
                <Activity className={`w-3 h-3 ${hasRealData ? 'text-military-amber' : 'text-gray-700'}`} /> 
                {hasRealData ? `${telemetry.alt}m` : '0m'}
              </span>
            </div>
            <span className={`tracking-wider ${isConnected ? 'text-military-green' : 'text-military-red'}`}>
              {isConnected ? 'LINK ACTIVE' : 'DISCONNECTED'}
            </span>
            <ClockDisplay />
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── CameraGrid ──────────────────────────────────────────────────────────── */
const CameraGrid = () => {
  const [pinnedCamId, setPinnedCamId] = useState(null);
  const [drones, setDrones] = useState([]);
  const [streamIps, setStreamIps] = useState(
    initialCameras.reduce((acc, cam) => ({ ...acc, [cam.id]: cam.ip }), {})
  );
  // AI state
  const [aiCameras, setAiCameras] = useState({});  // { camId: true/false }
  const [aiDetections, setAiDetections] = useState({});  // { camName: {...} }

  useEffect(() => {
    const unsub = subscribeDrones((droneList) => {
      setDrones(droneList);
    });
    return unsub;
  }, []);

  // Subscribe to AI detection WebSocket for live counts
  useEffect(() => {
    const unsub = subscribeDetections((msg) => {
      if (msg.type === 'detections' && msg.data) {
        setAiDetections(msg.data);
      }
    });
    return unsub;
  }, []);

  const handleUpdateIp = (id, newIp) => {
    setStreamIps(prev => ({ ...prev, [id]: newIp }));
  };

  const togglePin = (id) => {
    setPinnedCamId(prev => (prev === id ? null : id));
  };

  const handleToggleAI = useCallback(async (cam) => {
    const camKey = cam.id;
    const isCurrentlyOn = aiCameras[camKey];
    const streamUrl = streamIps[camKey];

    if (isCurrentlyOn) {
      // Disable AI
      try { await unregisterAICamera(cam.name); } catch {}
      setAiCameras(prev => ({ ...prev, [camKey]: false }));
    } else {
      // Enable AI
      if (!streamUrl || streamUrl.trim() === '') {
        alert('Set a camera stream URL before enabling AI detection.');
        return;
      }
      try {
        const sectorName = cam.sector.replace('SECTOR ', '');
        await registerAICamera({
          camera_id: cam.name,
          url: streamUrl,
          sector: sectorName,
        });
        setAiCameras(prev => ({ ...prev, [camKey]: true }));
      } catch (err) {
        console.error('Failed to enable AI:', err);
      }
    }
  }, [aiCameras, streamIps]);

  const aiCount = Object.values(aiCameras).filter(Boolean).length;

  return (
    <div className="w-full h-full p-4 flex flex-col bg-military-panel/50 overflow-hidden">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h2 className="text-sm font-bold text-military-green tracking-widest uppercase font-sans">Tactical Feeds</h2>
        <div className="flex items-center gap-4">
          {aiCount > 0 && (
            <span className="text-[10px] font-mono text-green-400 flex items-center gap-1">
              <Cpu className="w-3 h-3" /> AI: {aiCount} CAM{aiCount > 1 ? 'S' : ''}
            </span>
          )}
          <div className="text-xs text-gray-400 font-mono">
            {pinnedCamId ? `MODE: SINGLE FEED — MAXIMIZED` : 'MODE: 2×2 GRID PATROL'}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative w-full">
        {pinnedCamId ? (
          <div className="absolute inset-0">
            <CameraFeed
              cam={initialCameras.find(c => c.id === pinnedCamId)}
              isPinned={true}
              onTogglePin={togglePin}
              droneData={drones.find(d => d.name === initialCameras.find(c => c.id === pinnedCamId).drone)}
              streamIp={streamIps[pinnedCamId]}
              onUpdateIp={handleUpdateIp}
              aiEnabled={!!aiCameras[pinnedCamId]}
              onToggleAI={handleToggleAI}
              aiDetections={aiDetections[initialCameras.find(c => c.id === pinnedCamId)?.name]}
            />
          </div>
        ) : (
          <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-3">
            {initialCameras.map(cam => (
              <div key={cam.id} className="min-h-0">
                <CameraFeed
                  cam={cam}
                  isPinned={false}
                  onTogglePin={togglePin}
                  droneData={drones.find(d => d.name === cam.drone)}
                  streamIp={streamIps[cam.id]}
                  onUpdateIp={handleUpdateIp}
                  aiEnabled={!!aiCameras[cam.id]}
                  onToggleAI={handleToggleAI}
                  aiDetections={aiDetections[cam.name]}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraGrid;
