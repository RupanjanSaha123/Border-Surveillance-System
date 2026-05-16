import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../styles/map-overrides.css';
import { format } from 'date-fns';

// ── Orthogonal waypoints in lat/lng (only lat OR lng changes per segment) ─────
const WAYPOINTS = [
  [32.48, 76.42],
  [32.48, 76.49], // → east
  [32.53, 76.49], // ↑ north
  [32.53, 76.56], // → east
  [32.46, 76.56], // ↓ south
  [32.46, 76.63], // → east
  [32.52, 76.63], // ↑ north
  [32.52, 76.68], // → east
];

// ── Animate drone along waypoints ─────────────────────────────────────────────
const usePatrolAnimation = (wps) => {
  const [state, setState] = useState({ pos: wps[0], segIdx: 0, segProg: 0 });
  const r = useRef({ segIdx: 0, segProg: 0, lastTs: null });
  const af = useRef(null);
  const SPEED = 0.000048; // normalized progress per ms

  useEffect(() => {
    const total = wps.length - 1;
    const tick = (ts) => {
      const s = r.current;
      if (!s.lastTs) s.lastTs = ts;
      const dt = Math.min(ts - s.lastTs, 50);
      s.lastTs = ts;
      const from = wps[s.segIdx], to = wps[s.segIdx + 1] || wps[0];
      const len = Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]);
      s.segProg += (dt * SPEED) / Math.max(len, 0.001);
      if (s.segProg >= 1) { s.segProg = 0; s.segIdx = (s.segIdx + 1) % total; }
      const f = wps[s.segIdx], t2 = wps[s.segIdx + 1] || wps[0];
      const p = s.segProg;
      setState({ pos: [f[0] + (t2[0] - f[0]) * p, f[1] + (t2[1] - f[1]) * p], segIdx: s.segIdx, segProg: p });
      af.current = requestAnimationFrame(tick);
    };
    af.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(af.current);
  }, []);

  return state;
};

// ── Leaflet layers for visited + planned paths ─────────────────────────────────
const PatrolLines = ({ wps, segIdx, dronePos }) => {
  const map = useMap();
  const vRef = useRef(null);
  const pRef = useRef(null);

  useEffect(() => {
    const visited = [...wps.slice(0, segIdx + 1), dronePos];
    const planned = [dronePos, ...wps.slice(segIdx + 1)];

    if (!vRef.current) {
      vRef.current = L.polyline(visited, { color: '#8B8F74', weight: 2.2, opacity: 0.95, smoothFactor: 0 }).addTo(map);
    } else { vRef.current.setLatLngs(visited); }

    if (!pRef.current) {
      pRef.current = L.polyline(planned, { color: '#8B8F74', weight: 1.4, opacity: 0.28, dashArray: '8 8', smoothFactor: 0 }).addTo(map);
    } else { pRef.current.setLatLngs(planned); }
  });

  useEffect(() => () => {
    if (vRef.current) map.removeLayer(vRef.current);
    if (pRef.current) map.removeLayer(pRef.current);
  }, [map]);

  return null;
};

// ── Waypoint dot markers ───────────────────────────────────────────────────────
const WpDot = ({ pos, visited }) => {
  const col = visited ? '#8B8F74' : '#8B8F74';
  const op  = visited ? '1' : '0.25';
  const icon = L.divIcon({
    html: `<div style="width:8px;height:8px;border-radius:50%;border:1.5px solid ${col};background:${col}55;opacity:${op};margin:-4px"></div>`,
    className: '', iconSize: [0, 0],
  });
  return <Marker position={pos} icon={icon} />;
};

// ── Drone icon ─────────────────────────────────────────────────────────────────
const DRONE_ICON = L.divIcon({
  html: `<svg width="34" height="34" viewBox="-17 -17 34 34" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
    <circle r="6" fill="#243026" stroke="#8B8F74" stroke-width="1.6"/>
    <line x1="-14" y1="0" x2="-6" y2="0" stroke="#8B8F74" stroke-width="1.5"/>
    <line x1="6"   y1="0" x2="14" y2="0" stroke="#8B8F74" stroke-width="1.5"/>
    <line x1="0" y1="-14" x2="0" y2="-6" stroke="#8B8F74" stroke-width="1.5"/>
    <line x1="0" y1="6"   x2="0" y2="14" stroke="#8B8F74" stroke-width="1.5"/>
    <circle cx="-14" cy="0"  r="3.2" fill="none" stroke="#8B8F74" stroke-width="1" opacity="0.75"/>
    <circle cx="14"  cy="0"  r="3.2" fill="none" stroke="#8B8F74" stroke-width="1" opacity="0.75"/>
    <circle cx="0"  cy="-14" r="3.2" fill="none" stroke="#8B8F74" stroke-width="1" opacity="0.75"/>
    <circle cx="0"  cy="14"  r="3.2" fill="none" stroke="#8B8F74" stroke-width="1" opacity="0.75"/>
    <circle r="2.5" fill="#8B8F74"/>
    <circle r="20" fill="none" stroke="#8B8F74" stroke-width="0.8" opacity="0.35" stroke-dasharray="5 4">
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="3s" repeatCount="indefinite"/>
    </circle>
  </svg>`,
  className: '', iconSize: [34, 34], iconAnchor: [17, 17],
});

// ── Radar widget ───────────────────────────────────────────────────────────────
const Radar = ({ color, dur, label }) => (
  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', pointerEvents:'none' }}>
    <svg width="82" height="82" viewBox="0 0 90 90">
      <circle cx="45" cy="45" r="42" fill="rgba(0,0,0,0.35)" stroke={color} strokeWidth="0.7" opacity="0.55"/>
      <circle cx="45" cy="45" r="29" fill="none" stroke={color} strokeWidth="0.5" opacity="0.32"/>
      <circle cx="45" cy="45" r="16" fill="none" stroke={color} strokeWidth="0.5" opacity="0.26"/>
      <line x1="45" y1="3"  x2="45" y2="87" stroke={color} strokeWidth="0.4" opacity="0.2"/>
      <line x1="3"  y1="45" x2="87" y2="45" stroke={color} strokeWidth="0.4" opacity="0.2"/>
      <line x1="45" y1="45" x2="45" y2="5" stroke={color} strokeWidth="2.2" opacity="0.92" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 45 45" to="360 45 45" dur={dur} repeatCount="indefinite"/>
      </line>
      <circle cx="45" cy="45" r="3" fill={color}/>
    </svg>
    <div style={{ fontFamily:'monospace', color, fontSize:8, letterSpacing:'0.2em', marginTop:2 }}>{label}</div>
  </div>
);

// ── ThreatMarker: pulsing red zone at alert lat/lng ────────────────────────────
const ThreatMarker = ({ mapCenter }) => {
  const map = useMap();
  const layersRef = useRef([]);

  useEffect(() => {
    // Clean up previous layers
    layersRef.current.forEach(l => map.removeLayer(l));
    layersRef.current = [];
    if (!mapCenter) return;

    const { lat, lng, sector, threat } = mapCenter;

    // Fly map to threat location
    map.flyTo([lat, lng], 13, { duration: 1.8 });

    // Outer pulsing ring (large)
    const outerRing = L.circle([lat, lng], {
      radius: 600, color: '#ef4444', fillColor: '#ef4444',
      fillOpacity: 0.06, weight: 1.2, dashArray: '6 5',
    }).addTo(map);

    // Middle ring
    const midRing = L.circle([lat, lng], {
      radius: 280, color: '#ef4444', fillColor: '#ef4444',
      fillOpacity: 0.12, weight: 1.8,
    }).addTo(map);

    // Inner filled zone
    const inner = L.circle([lat, lng], {
      radius: 100, color: '#ef4444', fillColor: '#ef4444',
      fillOpacity: 0.3, weight: 2.5,
    }).addTo(map);

    // Crosshair marker with blinking label
    const threatIcon = L.divIcon({
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;pointer-events:none;">
          <!-- Crosshair -->
          <svg width="28" height="28" viewBox="-14 -14 28 28" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
            <circle r="8" fill="rgba(239,68,68,0.25)" stroke="#ef4444" stroke-width="2"/>
            <line x1="-14" y1="0" x2="-9" y2="0" stroke="#ef4444" stroke-width="1.5"/>
            <line x1="9"   y1="0" x2="14" y2="0" stroke="#ef4444" stroke-width="1.5"/>
            <line x1="0" y1="-14" x2="0" y2="-9" stroke="#ef4444" stroke-width="1.5"/>
            <line x1="0" y1="9"   x2="0" y2="14" stroke="#ef4444" stroke-width="1.5"/>
            <circle r="2.5" fill="#ef4444"/>
          </svg>
          <!-- Label -->
          <div style="
            margin-top:4px;
            background:rgba(0,0,0,0.85);
            border:1px solid #ef4444;
            padding:2px 6px;
            font-family:monospace;
            font-size:9px;
            color:#ef4444;
            letter-spacing:0.15em;
            white-space:nowrap;
            animation: threatBlink 1s step-start infinite;
          ">⚠ SEC-${sector ?? '?'}</div>
        </div>
        <style>
          @keyframes threatBlink {
            0%,100%{opacity:1} 50%{opacity:0.3}
          }
        </style>
      `,
      className: '',
      iconSize:   [28, 28],
      iconAnchor: [14, 14],
    });
    const pin = L.marker([lat, lng], { icon: threatIcon }).addTo(map);

    layersRef.current = [outerRing, midRing, inner, pin];

    return () => layersRef.current.forEach(l => map.removeLayer(l));
  }, [mapCenter, map]);

  return null;
};

// ── MapSection ─────────────────────────────────────────────────────────────────
const MapSection = ({ mapCenter, resolvedAlerts }) => {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);

  const { pos, segIdx, segProg } = usePatrolAnimation(WAYPOINTS);

  const s = { fontFamily: 'monospace' };

  return (
    <div style={{ ...s, width:'100%', height:'100%', position:'relative' }}>

      {/* ── Real Leaflet map ── */}
      <MapContainer center={[32.50, 76.55]} zoom={11} style={{ width:'100%', height:'100%' }} zoomControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'/>
        <PatrolLines wps={WAYPOINTS} segIdx={segIdx} dronePos={pos}/>
        {WAYPOINTS.map((wp, i) => <WpDot key={i} pos={wp} visited={i <= segIdx}/>)}
        <Marker position={pos} icon={DRONE_ICON}/>
        {/* Threat zone marker — auto-placed when alert fires */}
        {mapCenter && (!resolvedAlerts || !resolvedAlerts.has(mapCenter.id)) && <ThreatMarker mapCenter={mapCenter}/>}
      </MapContainer>

      {/* ── Corner brackets ── */}
      {[
        { top:12, left:12 },  { top:12, right:12 },
        { bottom:12, left:12 },{ bottom:12, right:12 },
      ].map((style, i) => {
        const sx = i % 2 === 0 ? 1 : -1, sy = i < 2 ? 1 : -1;
        return (
          <svg key={i} width="28" height="28" style={{ position:'absolute', ...style, zIndex:600, pointerEvents:'none' }} viewBox="0 0 28 28">
            <polyline fill="none" stroke="#8B8F74" strokeWidth="1.5" opacity="0.65"
              points={sx===1 && sy===1  ? '24,2 2,2 2,24'
                    : sx===-1 && sy===1  ? '4,2 26,2 26,24'
                    : sx===1 && sy===-1  ? '24,26 2,26 2,4'
                    :                      '4,26 26,26 26,4'}/>
          </svg>
        );
      })}

      {/* ── Top HUD ── */}
      <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:500, pointerEvents:'none',
        background:'linear-gradient(to bottom,rgba(0,0,0,0.8) 0%,transparent 100%)',
        display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 18px 24px' }}>
        <div>
          <div style={{ fontSize:9, color:'#8B8F74', letterSpacing:'0.25em' }}>MAP NAVIGATION</div>
          <div style={{ fontSize:8, color:'#3C4A3B', letterSpacing:'0.2em' }}>SECTOR: {mapCenter?.sector ?? 'ALPHA-7'}</div>
        </div>
        <div style={{ display:'flex', gap:32 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:8, color:'#6b7280', letterSpacing:'0.18em' }}>LAT</div>
            <div style={{ fontSize:11, color:'#fff' }}>{pos[0].toFixed(5)} N</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:8, color:'#6b7280', letterSpacing:'0.18em' }}>LNG</div>
            <div style={{ fontSize:11, color:'#fff' }}>{pos[1].toFixed(5)} E</div>
          </div>
        </div>
        <div style={{ fontSize:9, color:'#4ade80', letterSpacing:'0.2em' }}>{format(time, 'HH:mm:ss')} IST</div>
      </div>

      {/* ── Waveform top-right ── */}
      <div style={{ position:'absolute', top:52, right:16, zIndex:500, pointerEvents:'none' }}>
        <svg width="126" height="42" viewBox="0 0 126 42">
          <rect width="126" height="42" fill="rgba(0,0,0,0.45)" rx="2"/>
          <polyline points="0,21 10,9 20,34 30,5 42,37 52,14 62,27 72,8 84,35 94,17 104,29 114,10 126,21"
            fill="none" stroke="#4ade80" strokeWidth="1.3" opacity="0.75"/>
        </svg>
        <div style={{ fontSize:7, color:'#8B8F74', letterSpacing:'0.22em', marginTop:2 }}>SIGNAL FEED</div>
      </div>

      {/* ── Radars ── */}
      <div style={{ position:'absolute', bottom:16, left:16, zIndex:500 }}>
        <Radar color="#3C4A3B" dur="4s" label="RADAR"/>
      </div>
      <div style={{ position:'absolute', bottom:16, right:16, zIndex:500 }}>
        <Radar color="#8B8F74" dur="6s" label="TARGET"/>
      </div>

      {/* ── Right status ── */}
      <div style={{ position:'absolute', top:'50%', right:10, transform:'translateY(-50%)', zIndex:500, pointerEvents:'none', textAlign:'right', display:'flex', flexDirection:'column', gap:6 }}>
        {['ALT: 450 M','SPD: 42 KT','STATUS: PATROL','FUEL: 84%'].map((t,i) => (
          <div key={i} style={{ fontSize:8, color: i<2 ? '#8B8F74' : '#3C4A3B', letterSpacing:'0.18em' }}>{t}</div>
        ))}
      </div>

      {/* ── Bottom bar ── */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, zIndex:500, pointerEvents:'none',
        background:'linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 100%)',
        display:'flex', alignItems:'flex-end', justifyContent:'space-between', padding:'24px 18px 8px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background:'#8B8F74' }}/>
          <span style={{ fontSize:8, color:'#8B8F74', letterSpacing:'0.2em' }}>DRONE-ALPHA · ACTIVE PATROL</span>
        </div>
        {mapCenter && (!resolvedAlerts || !resolvedAlerts.has(mapCenter.id)) ? (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'#ef4444', animation:'pulse 1s infinite' }}/>
            <span style={{ fontSize:8, color:'#ef4444', letterSpacing:'0.2em' }}>
              ⚠ THREAT · {mapCenter.lat}, {mapCenter.lng}
            </span>
          </div>
        ) : (
          <div style={{ fontSize:8, color:'#4b5563', letterSpacing:'0.18em' }}>
            WP-{segIdx} → WP-{segIdx + 1} · {Math.round(segProg * 100)}%
          </div>
        )}
      </div>
    </div>
  );
};

export default MapSection;
