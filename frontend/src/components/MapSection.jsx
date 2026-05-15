import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Copy, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

// Fix for default marker icons in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Drone Icon
const droneIconHtml = `
  <div class="relative flex items-center justify-center w-4 h-4">
    <div class="absolute w-4 h-4 bg-military-green rounded-full animate-ping opacity-75"></div>
    <div class="relative w-2 h-2 bg-military-green rounded-full"></div>
  </div>
`;
const droneIcon = L.divIcon({
  html: droneIconHtml,
  className: 'bg-transparent border-none',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

// Component to handle dynamic map centering
const MapController = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo([center.lat, center.lng], 14, { duration: 1.5 });
    }
  }, [center, map]);
  return null;
};

const MapSection = ({ mapCenter }) => {
  const defaultCenter = [32.5, 76.5]; // India border region approx
  const [copied, setCopied] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);

  // Mock drones
  const [drones] = useState([
    { id: 1, lat: 32.48, lng: 76.45, name: 'DRONE-ALPHA' },
    { id: 2, lat: 32.52, lng: 76.55, name: 'DRONE-BRAVO' },
    { id: 3, lat: 32.45, lng: 76.60, name: 'DRONE-CHARLIE' },
  ]);

  const handleMapClick = (e) => {
    setSelectedPoint(e.latlng);
  };

  const copyToClipboard = (lat, lng) => {
    const msg = `ALERT — Sector Sector-Name | Lat: ${lat.toFixed(4)} Lng: ${lng.toFixed(4)} | Threat: Unidentified Movement | Time: ${format(new Date(), 'HH:mm:ss')} IST`;
    navigator.clipboard.writeText(msg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full h-full relative flex flex-col bg-black">
      {/* Top HUD */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] pointer-events-none">
        <div className="bg-military-panel/80 border border-military-green px-4 py-2 backdrop-blur-md flex items-center gap-4">
          <Crosshair className="w-4 h-4 text-military-green animate-pulse" />
          <div className="text-white font-mono text-sm tracking-wider">
            {mapCenter ? `${mapCenter.lat.toFixed(4)} N, ${mapCenter.lng.toFixed(4)} E` : 'SCANNING TACTICAL MAP...'}
          </div>
        </div>
      </div>

      <div className="flex-1 relative z-0">
        <MapContainer 
          center={defaultCenter} 
          zoom={11} 
          className="w-full h-full"
          zoomControl={false}
          onClick={handleMapClick}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          
          <MapController center={mapCenter} />

          {/* Alert Marker */}
          {mapCenter && (
             <CircleMarker 
              center={[mapCenter.lat, mapCenter.lng]}
              radius={30}
              pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.2 }}
              className="animate-pulse-border"
            >
              <Popup className="military-popup">
                <div className="bg-military-panel text-white p-2 min-w-[200px]">
                  <h4 className="text-military-red font-bold text-xs uppercase tracking-widest mb-2 border-b border-military-red/30 pb-1">Target Location</h4>
                  <div className="font-mono text-xs mb-3 text-gray-300">
                    LAT: {mapCenter.lat.toFixed(4)}<br/>
                    LNG: {mapCenter.lng.toFixed(4)}
                  </div>
                  <button 
                    onClick={() => copyToClipboard(mapCenter.lat, mapCenter.lng)}
                    className="w-full flex items-center justify-center gap-2 bg-military-red/20 text-military-red text-[10px] py-1 border border-military-red/50 hover:bg-military-red hover:text-white transition-colors uppercase tracking-widest"
                  >
                    {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Send to Officer'}
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          )}

          {/* Click to add Marker */}
          {selectedPoint && (
            <Popup position={[selectedPoint.lat, selectedPoint.lng]} className="military-popup">
              <div className="bg-military-panel text-white p-2 min-w-[150px] border border-military-green/50">
                <h4 className="text-military-green font-bold text-xs uppercase tracking-widest mb-2 border-b border-military-green/30 pb-1">Coordinates</h4>
                <div className="font-mono text-[10px] mb-3 text-gray-300">
                  LAT: {selectedPoint.lat.toFixed(4)}<br/>
                  LNG: {selectedPoint.lng.toFixed(4)}
                </div>
                <button 
                  onClick={() => setSelectedPoint(null)}
                  className="w-full bg-military-green/20 text-military-green text-[10px] py-1 border border-military-green/50 hover:bg-military-green hover:text-white transition-colors uppercase tracking-widest"
                >
                  Mark As Zone
                </button>
              </div>
            </Popup>
          )}

          {/* Drone Markers */}
          {drones.map(drone => (
            <Marker key={drone.id} position={[drone.lat, drone.lng]} icon={droneIcon}>
              <Popup className="military-popup">
                <div className="bg-military-panel border border-military-green text-white p-2 min-w-[150px]">
                  <h4 className="text-military-green font-bold text-[10px] uppercase tracking-widest mb-1">{drone.name}</h4>
                  <div className="font-mono text-[10px] text-gray-400">STATUS: ACTIVE</div>
                  <div className="font-mono text-[10px] text-gray-400">ALT: 450m</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Global style overrides for Leaflet Popups to match theme */}
        <style dangerouslySetInnerHTML={{__html: `
          .leaflet-popup-content-wrapper {
            background-color: transparent !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          .leaflet-popup-tip {
            background-color: #0d1117 !important;
            border: 1px solid #4a6741;
          }
          .leaflet-popup-content {
            margin: 0 !important;
          }
        `}} />
      </div>
    </div>
  );
};

export default MapSection;
