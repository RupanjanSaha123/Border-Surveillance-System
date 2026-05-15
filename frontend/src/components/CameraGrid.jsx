import React, { useState } from 'react';
import { Camera, Maximize2, Minimize2, Wifi, Activity } from 'lucide-react';
import { format } from 'date-fns';

const cameras = [
  { id: 1, name: 'CAM-01 — SECTOR ALPHA', ip: 'rtsp://10.0.0.1/stream1' },
  { id: 2, name: 'CAM-02 — SECTOR BRAVO', ip: 'rtsp://10.0.0.2/stream1' },
  { id: 3, name: 'CAM-03 — SECTOR CHARLIE', ip: 'rtsp://10.0.0.3/stream1' },
  { id: 4, name: 'CAM-04 — SECTOR DELTA', ip: 'rtsp://10.0.0.4/stream1' },
];

const CameraFeed = ({ cam, isPinned, onTogglePin }) => {
  const [streamIp, setStreamIp] = useState(cam.ip);

  return (
    <div className={`relative flex flex-col bg-black border border-military-green/50 p-1 group transition-all duration-300 ${isPinned ? 'w-full h-full' : 'w-full h-full'}`}>
      
      {/* Decorative Corner Brackets */}
      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-military-green opacity-50 z-10"></div>
      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-military-green opacity-50 z-10"></div>
      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-military-green opacity-50 z-10"></div>
      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-military-green opacity-50 z-10"></div>

      {/* Header */}
      <div className="absolute top-2 left-2 right-2 flex justify-between items-start z-10">
        <div className="flex items-center gap-2 bg-black/60 px-2 py-1 border border-military-green/30 backdrop-blur-sm">
          <div className="w-2 h-2 rounded-full bg-military-red animate-blink"></div>
          <span className="text-xs text-white font-bold tracking-widest uppercase">LIVE</span>
          <span className="text-[10px] text-military-green font-mono ml-2">{cam.name}</span>
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); onTogglePin(cam.id); }}
          className="bg-black/60 p-1 border border-military-green/30 text-military-green hover:text-military-amber hover:border-military-amber transition-colors backdrop-blur-sm"
        >
          {isPinned ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Main Feed Area (Placeholder) */}
      <div 
        className="flex-1 relative overflow-hidden bg-[#050805] flex items-center justify-center cursor-pointer military-scanline"
        onClick={() => onTogglePin(cam.id)}
      >
        {/* Grid Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(74,103,65,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(74,103,65,0.1)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>
        
        {/* Center Reticle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-8 bg-military-green"></div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-8 bg-military-green"></div>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-8 h-px bg-military-green"></div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-px bg-military-green"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-military-green"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-military-green rounded-full"></div>
        </div>

        <Camera className="w-12 h-12 text-military-green/20" />
      </div>

      {/* Footer Info */}
      <div className="h-14 flex flex-col justify-end bg-black mt-1 px-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] text-military-green uppercase tracking-widest shrink-0">Stream IP:</span>
          <input 
            type="text" 
            value={streamIp}
            onChange={(e) => setStreamIp(e.target.value)}
            className="flex-1 bg-military-green/10 border border-military-green/30 text-[10px] text-white font-mono px-2 py-0.5 focus:outline-none focus:border-military-amber focus:bg-military-amber/10 transition-colors"
          />
        </div>
        <div className="flex justify-between items-center text-[9px] text-gray-500 font-mono tracking-wider border-t border-military-green/20 pt-1">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1"><Wifi className="w-3 h-3 text-military-green" /> 98%</span>
            <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-military-amber" /> ALT: 450m</span>
          </div>
          <span>{format(new Date(), 'HH:mm:ss')}</span>
        </div>
      </div>

    </div>
  );
};

const CameraGrid = () => {
  const [pinnedCamId, setPinnedCamId] = useState(null);

  const togglePin = (id) => {
    if (pinnedCamId === id) {
      setPinnedCamId(null);
    } else {
      setPinnedCamId(id);
    }
  };

  return (
    <div className="w-full h-full p-4 flex flex-col bg-military-panel/50">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-bold text-military-green tracking-widest uppercase font-sans">
          Tactical Feeds
        </h2>
        <div className="text-xs text-gray-400 font-mono">
          {pinnedCamId ? 'MODE: SINGLE FEED (MAXIMIZED)' : 'MODE: 2x2 GRID PATROL'}
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
          <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-4">
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
