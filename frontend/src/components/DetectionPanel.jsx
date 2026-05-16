import React, { useState, useEffect } from 'react';
import { Cpu, Eye, Flame, Car, User, Crosshair, Activity, AlertTriangle, Zap, Shield, Clock, BarChart3, Settings2, ChevronRight } from 'lucide-react';
import { subscribeDetections, fetchAIStatus, registerAICamera, fetchDetectionHistory, fetchDetectionStats, tuneAIPerformance } from '../api';
import { format } from 'date-fns';

/* ─── AI Detection Panel ──────────────────────────────────────────────────── */
const DetectionPanel = () => {
  const [aiStatus, setAiStatus] = useState(null);
  const [detections, setDetections] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('live');  // 'live' | 'history' | 'stats'

  // Subscribe to detection WebSocket
  useEffect(() => {
    const unsub = subscribeDetections((msg) => {
      setWsConnected(true);
      if (msg.type === 'detections') {
        setDetections(msg.data || {});
        if (msg.status) {
          setAiStatus(prev => ({ ...prev, ...msg.status }));
        }
      } else if (msg.type === 'status') {
        setAiStatus(msg.data);
      }
    });

    // Initial status fetch
    fetchAIStatus()
      .then(setAiStatus)
      .catch(() => {});

    return unsub;
  }, []);

  // Aggregate totals across all cameras
  const totals = Object.values(detections).reduce(
    (acc, cam) => ({
      humans: acc.humans + (cam.humans || 0),
      vehicles: acc.vehicles + (cam.vehicles || 0),
      fire: acc.fire || cam.fire,
      weapons: acc.weapons + (cam.weapons || 0),
    }),
    { humans: 0, vehicles: 0, fire: false, weapons: 0 }
  );

  const cameraList = Object.values(detections);

  return (
    <div className="w-full h-full flex flex-col bg-military-bg overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-military-green bg-military-panel">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold tracking-widest text-military-amber uppercase flex items-center gap-2">
            <Cpu className="w-4 h-4" /> AI Detection Engine
          </h2>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${aiStatus?.running ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">
              {aiStatus?.running ? 'ACTIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        {/* Engine Stats */}
        {aiStatus && (
          <div className="grid grid-cols-4 gap-2 mb-3">
            <StatMini label="Device" value={aiStatus.device?.toUpperCase() || 'N/A'} color="text-military-green" />
            <StatMini label="YOLO" value={`${aiStatus.yolo_inference_ms || aiStatus.yolo_ms || 0}ms`} color="text-military-amber" />
            <StatMini label="Cameras" value={aiStatus.cameras || 0} color="text-white" />
            <StatMini
              label="WS Link"
              value={wsConnected ? 'LIVE' : 'DEAD'}
              color={wsConnected ? 'text-military-green' : 'text-military-red'}
            />
          </div>
        )}

        {/* Total Detection Counts */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <DetectionCounter
            icon={User} label="HUMANS" count={totals.humans}
            color={totals.humans > 0 ? 'text-green-400 border-green-400/30 bg-green-400/10' : ''}
          />
          <DetectionCounter
            icon={Car} label="VEHICLES" count={totals.vehicles}
            color={totals.vehicles > 0 ? 'text-blue-400 border-blue-400/30 bg-blue-400/10' : ''}
          />
          <DetectionCounter
            icon={Flame} label="FIRE" count={totals.fire ? '!' : '—'}
            color={totals.fire ? 'text-red-500 border-red-500/30 bg-red-500/10 animate-pulse' : ''}
          />
          <DetectionCounter
            icon={Crosshair} label="WEAPONS" count={totals.weapons}
            color={totals.weapons > 0 ? 'text-red-500 border-red-500/30 bg-red-500/10 animate-pulse' : ''}
          />
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1">
          {[
            { key: 'live', label: 'LIVE FEED', icon: Eye },
            { key: 'history', label: 'HISTORY', icon: Clock },
            { key: 'stats', label: 'ANALYTICS', icon: BarChart3 },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveSubTab(key)}
              className={`flex items-center gap-1.5 text-[10px] px-3 py-1.5 border uppercase tracking-widest transition-all ${
                activeSubTab === key
                  ? 'border-military-amber bg-military-amber/15 text-military-amber'
                  : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-400'
              }`}
            >
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeSubTab === 'live' && (
          <LiveDetectionView cameraList={cameraList} />
        )}
        {activeSubTab === 'history' && (
          <DetectionHistoryView />
        )}
        {activeSubTab === 'stats' && (
          <DetectionStatsView aiStatus={aiStatus} />
        )}
      </div>

      {/* Bottom Info */}
      <div className="shrink-0 px-4 py-2 border-t border-military-green/30 bg-military-panel/50">
        <div className="flex justify-between items-center text-[9px] font-mono text-gray-600">
          <span>AI ENGINE v2.5 · YOLOv8n + OpenVINO</span>
          <span>
            Total Alerts: {aiStatus?.total_alerts || 0} · Detections: {aiStatus?.total_detections || 0}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ─── Live Detection View ─────────────────────────────────────────────────── */
const LiveDetectionView = ({ cameraList }) => (
  <div className="px-4 py-3 space-y-2">
    <div className="text-[10px] text-military-green tracking-widest uppercase mb-2 flex items-center gap-2">
      <Eye className="w-3 h-3" /> Per-Camera Detection
    </div>

    {cameraList.length === 0 ? (
      <div className="flex flex-col items-center justify-center h-48 text-gray-600">
        <Cpu className="w-10 h-10 mb-3 opacity-20" />
        <span className="text-xs font-mono uppercase tracking-widest">
          No cameras registered for AI
        </span>
        <span className="text-[10px] text-gray-700 mt-1">
          Enable AI Detection on camera feeds
        </span>
      </div>
    ) : (
      cameraList.map((cam) => (
        <CameraDetectionCard key={cam.camera_id} data={cam} />
      ))
    )}
  </div>
);

/* ─── Detection History View ──────────────────────────────────────────────── */
const DetectionHistoryView = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'fire' | 'weapons'

  useEffect(() => {
    setLoading(true);
    fetchDetectionHistory({
      limit: 100,
      fire_only: filter === 'fire',
      weapons_only: filter === 'weapons',
    })
      .then(data => setHistory(data.history || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] text-military-green tracking-widest uppercase flex items-center gap-2">
          <Clock className="w-3 h-3" /> Detection History Log
        </div>
        <div className="flex gap-1">
          {[
            { key: 'all', label: 'ALL' },
            { key: 'fire', label: '🔥 FIRE' },
            { key: 'weapons', label: '⚠ WEAPONS' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-[9px] px-2 py-0.5 border uppercase tracking-wider transition-colors ${
                filter === key
                  ? key === 'fire' ? 'border-red-500/50 bg-red-500/15 text-red-400'
                    : key === 'weapons' ? 'border-military-amber/50 bg-military-amber/15 text-military-amber'
                    : 'border-military-green/50 bg-military-green/15 text-military-green'
                  : 'border-gray-700 text-gray-600 hover:border-gray-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-600 text-xs font-mono">
          <Cpu className="w-4 h-4 animate-spin mr-2" /> Loading history...
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-gray-600">
          <Clock className="w-8 h-8 mb-2 opacity-20" />
          <span className="text-xs font-mono uppercase tracking-widest">No detection events recorded</span>
        </div>
      ) : (
        <div className="space-y-1">
          {history.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-center gap-3 px-3 py-2 border-l-2 bg-black/30 font-mono text-[11px] ${
                entry.fire || entry.weapons > 0
                  ? 'border-military-red'
                  : entry.humans > 0 || entry.vehicles > 0
                  ? 'border-military-amber'
                  : 'border-gray-700'
              }`}
            >
              <span className="text-gray-500 w-16 shrink-0">
                {format(new Date(entry.timestamp), 'HH:mm:ss')}
              </span>
              <span className="text-military-green w-16 shrink-0 tracking-widest">
                {entry.camera_id}
              </span>
              <div className="flex gap-2 flex-1">
                {entry.humans > 0 && (
                  <span className="text-green-400">H:{entry.humans}</span>
                )}
                {entry.vehicles > 0 && (
                  <span className="text-blue-400">V:{entry.vehicles}</span>
                )}
                {entry.fire && (
                  <span className="text-red-400 animate-pulse">🔥 FIRE</span>
                )}
                {entry.weapons > 0 && (
                  <span className="text-red-400 animate-pulse">⚠ W:{entry.weapons}</span>
                )}
              </div>
              <span className="text-gray-600 text-[9px]">
                {entry.detection_fps}fps
              </span>
              {entry.alert_generated && (
                <span className="text-military-red text-[8px] border border-military-red/30 px-1">ALERT</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Detection Stats / Analytics View ────────────────────────────────────── */
const DetectionStatsView = ({ aiStatus }) => {
  const [stats, setStats] = useState(null);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [tuning, setTuning] = useState(false);
  const [tuneResult, setTuneResult] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchDetectionStats(hours)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [hours]);

  const handleTune = async () => {
    setTuning(true);
    try {
      const result = await tuneAIPerformance();
      setTuneResult(result);
      setTimeout(() => setTuneResult(null), 5000);
    } catch (err) {
      setTuneResult({ message: 'Tuning failed', error: true });
    }
    setTuning(false);
  };

  return (
    <div className="px-4 py-3 space-y-4">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-military-green tracking-widest uppercase flex items-center gap-2">
          <BarChart3 className="w-3 h-3" /> Detection Analytics
        </div>
        <div className="flex gap-1">
          {[1, 6, 24, 48].map(h => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`text-[9px] px-2 py-0.5 border uppercase tracking-wider transition-colors ${
                hours === h
                  ? 'border-military-amber/50 bg-military-amber/15 text-military-amber'
                  : 'border-gray-700 text-gray-600 hover:border-gray-500'
              }`}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-600 text-xs font-mono">
          <Cpu className="w-4 h-4 animate-spin mr-2" /> Loading stats...
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Total Snapshots" value={stats.total_snapshots} color="text-white" />
          <StatCard label="Cameras Active" value={stats.cameras?.length || 0} color="text-military-green" />
          <StatCard label="Humans Detected" value={stats.total_humans} color="text-green-400" icon={User} />
          <StatCard label="Vehicles Detected" value={stats.total_vehicles} color="text-blue-400" icon={Car} />
          <StatCard
            label="Fire Events" value={stats.fire_events} icon={Flame}
            color={stats.fire_events > 0 ? 'text-red-500' : 'text-gray-600'}
          />
          <StatCard
            label="Weapon Events" value={stats.weapon_events} icon={Crosshair}
            color={stats.weapon_events > 0 ? 'text-red-500' : 'text-gray-600'}
          />
          <StatCard label="Alerts Generated" value={stats.alerts_generated} color="text-military-amber" icon={AlertTriangle} />
          <StatCard label="Time Window" value={`${hours}h`} color="text-gray-400" icon={Clock} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-32 text-gray-600">
          <BarChart3 className="w-8 h-8 mb-2 opacity-20" />
          <span className="text-xs font-mono uppercase tracking-widest">No stats available</span>
        </div>
      )}

      {/* Engine Info */}
      {aiStatus && (
        <div className="border border-military-green/20 bg-black/40 p-3 space-y-2">
          <div className="text-[10px] text-military-green tracking-widest uppercase flex items-center gap-2 mb-2">
            <Settings2 className="w-3 h-3" /> Engine Configuration
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
            <span className="text-gray-500">Device</span>
            <span className="text-military-green">{(aiStatus.device || 'N/A').toUpperCase()}</span>
            <span className="text-gray-500">YOLO Latency</span>
            <span className="text-military-amber">{aiStatus.yolo_inference_ms || aiStatus.yolo_ms || 0}ms</span>
            <span className="text-gray-500">Uptime</span>
            <span className="text-white">{formatUptime(aiStatus.uptime_seconds)}</span>
            <span className="text-gray-500">Total Detections</span>
            <span className="text-white">{aiStatus.total_detections || 0}</span>
            <span className="text-gray-500">Total Alerts</span>
            <span className="text-military-amber">{aiStatus.total_alerts || 0}</span>
          </div>
        </div>
      )}

      {/* Performance Tuning */}
      <div className="border border-military-green/20 bg-black/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] text-military-green tracking-widest uppercase flex items-center gap-2">
            <Zap className="w-3 h-3" /> Performance Tuning
          </div>
          <button
            onClick={handleTune}
            disabled={tuning}
            className={`text-[10px] px-3 py-1 border uppercase tracking-widest transition-all flex items-center gap-1 ${
              tuneResult && !tuneResult.error
                ? 'border-military-green bg-military-green/20 text-military-green'
                : tuning
                ? 'border-gray-600 text-gray-500 cursor-wait'
                : 'border-military-amber text-military-amber hover:bg-military-amber/10'
            }`}
          >
            <Zap className={`w-3 h-3 ${tuning ? 'animate-spin' : ''}`} />
            {tuning ? 'TUNING...' : tuneResult ? 'TUNED ✓' : 'AUTO-TUNE'}
          </button>
        </div>
        {tuneResult && !tuneResult.error && (
          <div className="mt-2 text-[10px] font-mono space-y-1 text-gray-400">
            <div className="flex justify-between">
              <span>Inference Speed</span>
              <span className="text-military-amber">{tuneResult.inference_ms}ms</span>
            </div>
            <div className="flex justify-between">
              <span>Frame Skip</span>
              <span>
                <span className="text-gray-600">{tuneResult.old?.frame_skip}</span>
                <ChevronRight className="w-3 h-3 inline text-gray-600" />
                <span className="text-military-green">{tuneResult.new?.frame_skip}</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span>Detection FPS</span>
              <span>
                <span className="text-gray-600">{tuneResult.old?.detection_fps}</span>
                <ChevronRight className="w-3 h-3 inline text-gray-600" />
                <span className="text-military-green">{tuneResult.new?.detection_fps}</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Helper: format uptime ───────────────────────────────────────────────── */
function formatUptime(seconds) {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */

const StatMini = ({ label, value, color = 'text-white' }) => (
  <div className="bg-black/50 border border-military-green/20 px-2 py-1.5 text-center">
    <div className="text-[8px] text-gray-600 uppercase tracking-wider">{label}</div>
    <div className={`font-mono text-xs font-bold ${color}`}>{value}</div>
  </div>
);

const DetectionCounter = ({ icon: Icon, label, count, color = '' }) => (
  <div className={`border px-2 py-2 text-center transition-all ${
    color || 'border-gray-700/50 bg-black/30 text-gray-600'
  }`}>
    <Icon className="w-3.5 h-3.5 mx-auto mb-0.5" />
    <div className="font-mono font-bold text-lg leading-tight">{count}</div>
    <div className="text-[7px] uppercase tracking-widest mt-0.5">{label}</div>
  </div>
);

const StatCard = ({ label, value, color = 'text-white', icon: Icon }) => (
  <div className="bg-black/50 border border-military-green/20 px-3 py-2">
    <div className="flex items-center gap-1.5 mb-1">
      {Icon && <Icon className={`w-3 h-3 ${color}`} />}
      <span className="text-[8px] text-gray-600 uppercase tracking-wider">{label}</span>
    </div>
    <div className={`font-mono text-lg font-bold ${color}`}>{value}</div>
  </div>
);

const CameraDetectionCard = ({ data }) => {
  const hasDetections = data.humans > 0 || data.vehicles > 0 || data.fire || data.weapons > 0;
  const hasDanger = data.fire || data.weapons > 0;

  return (
    <div className={`p-3 border-l-2 bg-black/30 font-mono text-xs transition-all ${
      hasDanger ? 'border-military-red bg-military-red/5' :
      hasDetections ? 'border-military-amber' :
      'border-military-green/30'
    }`}>
      <div className="flex justify-between items-center mb-2">
        <span className={`font-bold tracking-widest ${
          hasDanger ? 'text-military-red' : 'text-white'
        }`}>
          {data.camera_id}
        </span>
        <span className="text-[10px] text-military-green">
          {data.detection_fps || 0} FPS
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <MiniStat label="H" value={data.humans} active={data.humans > 0} danger={false} />
        <MiniStat label="V" value={data.vehicles} active={data.vehicles > 0} danger={false} />
        <MiniStat label="F" value={data.fire ? '⚠' : '—'} active={data.fire} danger={data.fire} />
        <MiniStat label="W" value={data.weapons} active={data.weapons > 0} danger={data.weapons > 0} />
      </div>

      {/* Moving objects */}
      {data.moving_objects && data.moving_objects.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.moving_objects.map((obj, i) => (
            <span
              key={i}
              className="text-[9px] px-1.5 py-0.5 border border-yellow-500/40 text-yellow-400 bg-yellow-500/10 uppercase tracking-wider"
            >
              {obj.class} → {obj.direction}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const MiniStat = ({ label, value, active, danger }) => (
  <div className={`text-center py-1 border transition-colors ${
    danger ? 'border-military-red/40 bg-military-red/10 text-military-red' :
    active ? 'border-military-amber/30 bg-military-amber/10 text-military-amber' :
    'border-gray-800 text-gray-600'
  }`}>
    <div className="text-[8px] uppercase tracking-wider opacity-70">{label}</div>
    <div className="font-bold text-sm">{value}</div>
  </div>
);

export default DetectionPanel;
