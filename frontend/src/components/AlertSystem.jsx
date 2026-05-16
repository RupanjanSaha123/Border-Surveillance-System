import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { ShieldAlert, Radio, Zap, AlertTriangle, CheckCircle2, Clock, Check } from 'lucide-react';
import { acknowledgeAlert } from '../api';

/* ─── Mission Status Block ───────────────────────────────────────────────── */
const MissionStatus = ({ alerts }) => {
  const [uptime, setUptime] = useState(0); // seconds since mount

  useEffect(() => {
    const t = setInterval(() => setUptime(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const formatUptime = (s) => {
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  const critical = alerts.filter(a => a.type === 'critical').length;
  const warning  = alerts.filter(a => a.type === 'warning').length;
  const total    = alerts.length;

  // Derive overall threat level 0–4
  const threatLevel = total === 0 ? 0
    : critical >= 5 ? 4
    : critical >= 3 ? 3
    : critical >= 1 ? 2
    : warning  >= 1 ? 1
    : 0;

  const threatLabels = ['CLEAR', 'CAUTION', 'ELEVATED', 'HIGH', 'CRITICAL'];
  const threatColors = [
    'text-military-green',
    'text-yellow-400',
    'text-military-amber',
    'text-orange-400',
    'text-military-red',
  ];
  const threatBarColors = [
    'bg-military-green',
    'bg-yellow-400',
    'bg-military-amber',
    'bg-orange-400',
    'bg-military-red',
  ];

  const sectors = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'];
  const sectorAlerts = useMemo(() =>
    sectors.map(s => ({
      name: s,
      critical: alerts.filter(a => a.sector === s && a.type === 'critical').length,
      warning:  alerts.filter(a => a.sector === s && a.type === 'warning').length,
    })),
  [alerts]);

  return (
    <div className="shrink-0 border-b border-military-green bg-military-panel">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-military-green/20">
        <h3 className="text-[10px] text-military-green tracking-widest uppercase flex items-center gap-2">
          <Radio className="w-3 h-3 animate-pulse" /> Mission Status
        </h3>
        <div className="flex items-center gap-1 text-[10px] text-gray-500 font-mono">
          <Clock className="w-3 h-3" />
          <span>{formatUptime(uptime)}</span>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* ── Threat Level Gauge ── */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[9px] text-gray-500 uppercase tracking-widest">Threat Level</span>
            <span className={`text-[10px] font-bold font-mono tracking-widest ${threatColors[threatLevel]}`}>
              {threatLabels[threatLevel]}
            </span>
          </div>
          {/* 5-segment bar */}
          <div className="flex gap-0.5">
            {[0, 1, 2, 3, 4].map(i => (
              <div
                key={i}
                className={`h-2 flex-1 transition-all duration-500 ${
                  i <= threatLevel
                    ? threatBarColors[threatLevel]
                    : 'bg-military-amber/40'
                } ${i <= threatLevel && threatLevel === 4 ? 'animate-pulse' : ''}`}
              />
            ))}
          </div>
        </div>

        {/* ── Alert Counts ── */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-black/50 border border-military-green/20 p-2 text-center">
            <div className="text-[8px] text-gray-500 uppercase tracking-wider mb-0.5">Total</div>
            <div className="text-military-green font-mono font-bold text-sm">{total}</div>
          </div>
          <div className="bg-black/50 border border-military-red/20 p-2 text-center">
            <div className="text-[8px] text-gray-500 uppercase tracking-wider mb-0.5 flex items-center justify-center gap-1">
              <Zap className="w-2 h-2 text-military-red" />Critical
            </div>
            <div className={`font-mono font-bold text-sm ${critical > 0 ? 'text-military-red' : 'text-gray-600'}`}>{critical}</div>
          </div>
          <div className="bg-black/50 border border-military-amber/20 p-2 text-center">
            <div className="text-[8px] text-gray-500 uppercase tracking-wider mb-0.5 flex items-center justify-center gap-1">
              <AlertTriangle className="w-2 h-2 text-military-amber" />Warn
            </div>
            <div className={`font-mono font-bold text-sm ${warning > 0 ? 'text-military-amber' : 'text-gray-600'}`}>{warning}</div>
          </div>
        </div>

        {/* ── Per-Sector Activity Bars ── */}
        <div>
          <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2">Sector Activity</div>
          <div className="space-y-1.5">
            {sectorAlerts.map(({ name, critical: c, warning: w }) => {
              const hasCritical = c > 0;
              const hasAny = c + w > 0;
              return (
                <div key={name} className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-gray-400 w-16 shrink-0">{name}</span>
                  <div className="flex-1 h-1.5 bg-military-amber/40 relative overflow-hidden">
                    {hasAny && (
                      <div
                        className={`absolute left-0 top-0 h-full transition-all duration-700 ${hasCritical ? 'bg-military-red' : 'bg-military-amber'}`}
                        style={{ width: `${Math.min(100, (c + w) * 15)}%` }}
                      />
                    )}
                  </div>
                  {hasAny ? (
                    <span className={`text-[9px] font-mono w-4 text-right ${hasCritical ? 'text-military-red' : 'text-military-amber'}`}>{c + w}</span>
                  ) : (
                    <CheckCircle2 className="w-3 h-3 text-military-green/40" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── AlertSystem ─────────────────────────────────────────────────────────── */
const AlertSystem = ({ alerts, session, resolvedAlerts = new Set(), toggleResolved }) => {
  const handleAcknowledge = async (id) => {
    try {
      await acknowledgeAlert(id, session?.callSign || 'OPERATOR');
      // Also mark as resolved locally for consistency
      if (toggleResolved && !resolvedAlerts.has(id)) {
        toggleResolved(id);
      }
    } catch (err) {
      console.error('Failed to acknowledge alert', err);
    }
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Mission Status Block (replaces old Live Telemetry) */}
      <MissionStatus alerts={alerts} />

      {/* Threat Log */}
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
            alerts.map((alert) => {
              const resolved = resolvedAlerts.has(alert.id);
              const acknowledged = alert.acknowledged || resolved;
              
              return (
                <div
                  key={alert.id}
                  className={`p-3 border-l-2 bg-black/40 text-xs font-mono relative overflow-hidden group transition-opacity ${
                    resolved || alert.acknowledged
                      ? 'border-military-green/50 opacity-50'
                      : alert.type === 'critical'
                        ? 'border-military-red hover:bg-military-red/10'
                        : 'border-military-amber hover:bg-military-amber/10'
                  }`}
                >
                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                  <div className="flex justify-between items-start mb-1 relative z-10">
                    <span className={`font-bold tracking-widest ${
                      resolved || alert.acknowledged ? 'text-military-green/60 line-through'
                      : alert.type === 'critical' ? 'text-military-red' : 'text-military-amber'
                    }`}>
                      SEC-{alert.sector}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500">{format(new Date(alert.timestamp), 'HH:mm:ss')}</span>
                      {(resolved || alert.acknowledged) && <Check className="w-3 h-3 text-military-green" />}
                    </div>
                  </div>
                  <div className={`relative z-10 ${resolved || alert.acknowledged ? 'text-gray-500' : 'text-white'}`}>{alert.threat}</div>
                  {/* AI Detection Details */}
                  {alert.ai_description && !resolved && !alert.acknowledged && (
                    <div className="relative z-10 mt-1.5">
                      <div className="text-[10px] text-military-amber/90 italic leading-tight">{alert.ai_description}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {alert.ai_severity && (
                          <span className={`text-[8px] px-1.5 py-0.5 uppercase tracking-widest font-bold border ${
                            alert.ai_severity === 'emergency' ? 'border-red-500 text-red-400 bg-red-500/10' :
                            alert.ai_severity === 'critical' ? 'border-red-400 text-red-400 bg-red-400/10' :
                            alert.ai_severity === 'high' ? 'border-orange-400 text-orange-400 bg-orange-400/10' :
                            'border-yellow-400 text-yellow-400 bg-yellow-400/10'
                          }`}>{alert.ai_severity}</span>
                        )}
                        {alert.ai_detections?.humans > 0 && (
                          <span className="text-[8px] px-1 py-0.5 border border-green-500/40 text-green-400 bg-green-500/10">H:{alert.ai_detections.humans}</span>
                        )}
                        {alert.ai_detections?.vehicles > 0 && (
                          <span className="text-[8px] px-1 py-0.5 border border-blue-400/40 text-blue-400 bg-blue-400/10">V:{alert.ai_detections.vehicles}</span>
                        )}
                        {alert.ai_detections?.fire && (
                          <span className="text-[8px] px-1 py-0.5 border border-red-500/40 text-red-400 bg-red-500/10">🔥FIRE</span>
                        )}
                        {alert.ai_detections?.weapons > 0 && (
                          <span className="text-[8px] px-1 py-0.5 border border-red-500/40 text-red-400 bg-red-500/10 animate-pulse">⚠ W:{alert.ai_detections.weapons}</span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-end mt-2 relative z-10">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-military-green">{alert.camera}</span>
                      {resolved || alert.acknowledged ? (
                        <span className="text-[9px] text-military-green/70 font-bold tracking-widest">✓ RESOLVED</span>
                      ) : (
                        <span className="text-[9px] text-gray-400">{alert.lat}, {alert.lng}</span>
                      )}
                    </div>
                    
                    {!acknowledged && (
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className="text-[9px] px-2 py-1 border border-military-green/50 text-military-green hover:bg-military-green hover:text-black transition-colors uppercase tracking-widest"
                      >
                        Ack
                      </button>
                    )}

                    {acknowledged && toggleResolved && (
                      <button
                        onClick={() => toggleResolved(alert.id)}
                        title="Unmark resolved"
                        className="flex items-center justify-center p-1 hover:bg-white/5 rounded"
                      >
                         <CheckCircle2 className="w-3.5 h-3.5 text-military-green" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertSystem;
