import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ShieldAlert, Crosshair } from 'lucide-react';

const AlertSystem = ({ alerts }) => {
  const [gpsData, setGpsData] = useState({ lat: '32.4500', lng: '75.6800' });

  // Mock live GPS readout updates
  useEffect(() => {
    const timer = setInterval(() => {
      setGpsData({
        lat: (32.4500 + (Math.random() - 0.5) * 0.005).toFixed(4),
        lng: (75.6800 + (Math.random() - 0.5) * 0.005).toFixed(4)
      });
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Top GPS HUD Readout */}
      <div className="p-4 bg-military-panel border-b border-military-green shadow-[0_4px_20px_rgba(0,0,0,0.5)] z-10 shrink-0">
        <h3 className="text-[10px] text-military-green mb-1 tracking-widest uppercase flex items-center gap-2">
          <Crosshair className="w-3 h-3" /> Live Telemetry
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-black border border-military-green/30 p-2">
            <div className="text-[8px] text-gray-500 uppercase">Latitude</div>
            <div className="text-military-amber font-mono text-sm tracking-wider">{gpsData.lat} N</div>
          </div>
          <div className="bg-black border border-military-green/30 p-2">
            <div className="text-[8px] text-gray-500 uppercase">Longitude</div>
            <div className="text-military-amber font-mono text-sm tracking-wider">{gpsData.lng} E</div>
          </div>
        </div>
      </div>

      {/* Alert Log */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-4 pb-2 border-b border-military-green/30 shrink-0">
          <h3 className="text-xs text-white tracking-widest uppercase font-bold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-military-amber" /> 
            Threat Log
          </h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {alerts.length === 0 ? (
            <div className="text-center text-gray-600 text-xs py-8 uppercase tracking-widest font-mono">
              System Clear // No active threats
            </div>
          ) : (
            alerts.map((alert) => (
              <div 
                key={alert.id} 
                className={`p-3 border-l-2 bg-black/40 text-xs font-mono relative overflow-hidden group
                  ${alert.type === 'critical' ? 'border-military-red hover:bg-military-red/10' : 'border-military-amber hover:bg-military-amber/10'}`}
              >
                {/* Decorative scanning highlight */}
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                <div className="flex justify-between items-start mb-1 relative z-10">
                  <span className={`font-bold tracking-widest ${alert.type === 'critical' ? 'text-military-red' : 'text-military-amber'}`}>
                    SEC-{alert.sector}
                  </span>
                  <span className="text-[10px] text-gray-500">{format(new Date(alert.timestamp), 'HH:mm:ss')}</span>
                </div>
                <div className="text-white relative z-10">{alert.threat}</div>
                <div className="flex justify-between items-end mt-2 relative z-10">
                  <span className="text-[9px] text-military-green">{alert.camera}</span>
                  <span className="text-[9px] text-gray-400">{alert.lat}, {alert.lng}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertSystem;
