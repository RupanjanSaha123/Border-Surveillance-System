import React, { useState, useEffect, useRef } from 'react';
import { Shield, AlertTriangle, Lock } from 'lucide-react';

// ─── Credential Store ─────────────────────────────────────────────────────
const VALID_CREDENTIALS = [
  { officerId: 'IND-ARMY-001', password: 'SecurePass@1', unitCode: 'SEC-ALPHA', callSign: 'CMDR. RAJPUT' },
  { officerId: 'IND-ARMY-002', password: 'SecurePass@2', unitCode: 'SEC-BRAVO', callSign: 'MAJ. SHARMA' },
];

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

// ─── Boot sequence lines ───────────────────────────────────────────────────
const BOOT_LINES = [
  { text: 'BSC-DOP SYSTEM v2.4.1-ALPHA', delay: 0,    color: 'text-military-green', prefix: '►' },
  { text: 'INITIALIZING SECURE KERNEL...', delay: 300, color: 'text-gray-400',       prefix: '  ' },
  { text: 'LOADING ENCRYPTION MODULE [AES-256]...', delay: 700, color: 'text-gray-400', prefix: '  ' },
  { text: 'OK', delay: 1050, color: 'text-military-green', prefix: '    └─', inline: true },
  { text: 'ESTABLISHING SATELLITE UPLINK...', delay: 1200, color: 'text-gray-400', prefix: '  ' },
  { text: 'SIGNAL ACQUIRED  [12/12 DRONES]', delay: 1700, color: 'text-military-green', prefix: '    └─' },
  { text: 'LOADING TACTICAL MAP DATABASE...', delay: 2050, color: 'text-gray-400', prefix: '  ' },
  { text: 'OK', delay: 2350, color: 'text-military-green', prefix: '    └─', inline: true },
  { text: 'RUNNING PERIMETER INTEGRITY CHECK...', delay: 2550, color: 'text-gray-400', prefix: '  ' },
  { text: 'ALL SECTORS NOMINAL', delay: 3000, color: 'text-military-green', prefix: '    └─' },
  { text: '─────────────────────────────────────', delay: 3350, color: 'text-military-green/30', prefix: '' },
  { text: 'CLASSIFICATION: TOP SECRET', delay: 3550, color: 'text-military-red', prefix: '  ⬥ ' },
  { text: 'OPERATOR AUTHENTICATION REQUIRED', delay: 3900, color: 'text-military-amber', prefix: '  ⬥ ' },
];

const BOOT_TOTAL_MS = 4500; // when to show login form

// ─── Typewriter Boot Screen ────────────────────────────────────────────────
const BootScreen = ({ onDone }) => {
  const [visibleLines, setVisibleLines] = useState([]);
  const [cursorLine, setCursorLine]     = useState(0);
  const [done, setDone]                 = useState(false);

  useEffect(() => {
    const timers = BOOT_LINES.map((line, i) =>
      setTimeout(() => {
        setVisibleLines(prev => [...prev, i]);
        setCursorLine(i);
      }, line.delay)
    );

    const doneTimer = setTimeout(() => {
      setDone(true);
      // short pause then hand off to login
      setTimeout(onDone, 500);
    }, BOOT_TOTAL_MS);

    return () => { timers.forEach(clearTimeout); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div
      className={`absolute inset-0 z-20 bg-military-bg flex flex-col justify-center items-center transition-opacity duration-500 ${done ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      {/* CRT scanline overlay */}
      <div className="absolute inset-0 military-scanline pointer-events-none opacity-40" />

      {/* Terminal window */}
      <div className="relative w-full max-w-xl px-8">
        {/* Corner brackets */}
        <div className="absolute top-0 left-4 w-5 h-5 border-t-2 border-l-2 border-military-green/60" />
        <div className="absolute top-0 right-4 w-5 h-5 border-t-2 border-r-2 border-military-green/60" />
        <div className="absolute bottom-0 left-4 w-5 h-5 border-b-2 border-l-2 border-military-green/60" />
        <div className="absolute bottom-0 right-4 w-5 h-5 border-b-2 border-r-2 border-military-green/60" />

        {/* Title bar */}
        <div className="border border-military-green/30 bg-military-panel/60 backdrop-blur-sm px-4 pt-4 pb-6">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-military-green/20">
            <div className="w-2 h-2 rounded-full bg-military-red animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-military-amber" />
            <div className="w-2 h-2 rounded-full bg-military-green" />
            <span className="ml-2 text-[10px] text-gray-500 font-mono tracking-widest uppercase">
              TERMINAL — BSC SECURE BOOT
            </span>
          </div>

          {/* Boot lines */}
          <div className="font-mono text-xs space-y-0.5 min-h-[200px]">
            {BOOT_LINES.map((line, i) => (
              <div
                key={i}
                className={`flex gap-2 transition-all duration-200 ${
                  visibleLines.includes(i) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
                }`}
              >
                <span className="text-military-green/50 shrink-0 w-6">{line.prefix}</span>
                <span className={line.color}>{line.text}</span>
                {/* blinking cursor after last visible line */}
                {i === cursorLine && !done && (
                  <span className="text-military-green animate-blink ml-0.5">█</span>
                )}
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="mt-4 pt-3 border-t border-military-green/20">
            <div className="flex justify-between text-[9px] text-gray-600 font-mono mb-1">
              <span>SYSTEM BOOT</span>
              <span>{done ? '100' : Math.round((visibleLines.length / BOOT_LINES.length) * 100)}%</span>
            </div>
            <div className="w-full h-1 bg-gray-800">
              <div
                className="h-full bg-military-green transition-all duration-300"
                style={{ width: `${(visibleLines.length / BOOT_LINES.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Login Form ────────────────────────────────────────────────────────────
const Login = ({ onLogin }) => {
  const [booted, setBooted]             = useState(false);
  const [officerId, setOfficerId]       = useState('');
  const [password, setPassword]         = useState('');
  const [unitCode, setUnitCode]         = useState('');
  const [error, setError]               = useState('');
  const [attempts, setAttempts]         = useState(0);
  const [lockedUntil, setLockedUntil]   = useState(null);
  const [countdown, setCountdown]       = useState(0);
  const timerRef = useRef(null);

  // Lockout countdown ticker
  useEffect(() => {
    if (lockedUntil) {
      timerRef.current = setInterval(() => {
        const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
        if (remaining <= 0) {
          clearInterval(timerRef.current);
          setLockedUntil(null);
          setCountdown(0);
          setAttempts(0);
          setError('');
        } else {
          setCountdown(remaining);
        }
      }, 500);
    }
    return () => clearInterval(timerRef.current);
  }, [lockedUntil]);

  const isLocked = lockedUntil && Date.now() < lockedUntil;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLocked) return;

    const match = VALID_CREDENTIALS.find(
      (c) =>
        c.officerId === officerId.trim().toUpperCase() &&
        c.password  === password &&
        c.unitCode  === unitCode.trim().toUpperCase()
    );

    if (match) {
      setError('');
      onLogin({ officerId: match.officerId, callSign: match.callSign, unitCode: match.unitCode, loginTime: new Date().toISOString() });
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_SECONDS * 1000;
        setLockedUntil(until);
        setCountdown(LOCKOUT_SECONDS);
        setError(`⚠ ACCOUNT LOCKED — Too many failed attempts. Try again in ${LOCKOUT_SECONDS}s.`);
      } else {
        setError(`✗ Invalid credentials. ${MAX_ATTEMPTS - newAttempts} attempt(s) remaining.`);
      }
      setPassword('');
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-military-bg overflow-hidden military-scanline">
      {/* Boot screen — sits on top until done */}
      {!booted && <BootScreen onDone={() => setBooted(true)} />}

      {/* Background Radar Animation */}
      <div className="absolute inset-0 z-0 flex items-center justify-center opacity-20 pointer-events-none">
        <div className="relative w-[800px] h-[800px] rounded-full border border-military-green/30">
          <div className="absolute inset-0 rounded-full border border-military-green/20 m-[100px]" />
          <div className="absolute inset-0 rounded-full border border-military-green/10 m-[200px]" />
          <div className="absolute inset-0 rounded-full border border-military-green/5 m-[300px]" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-military-green/20" />
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-military-green/20" />
          <div
            className="absolute top-1/2 left-1/2 w-[400px] h-[400px] origin-top-left"
            style={{ background: 'conic-gradient(from 0deg, transparent 70%, rgba(74, 103, 65, 0.8) 100%)', animation: 'radar-sweep 4s linear infinite' }}
          />
        </div>
      </div>

      {/* Login Panel — fades in after boot */}
      <div
        className={`relative z-10 bg-military-panel border border-military-green p-8 shadow-2xl w-full max-w-md transition-all duration-700 ${
          booted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        {/* Decorative corner brackets */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-military-amber" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-military-amber" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-military-amber" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-military-amber" />

        <div className="flex flex-col items-center mb-6">
          <Shield className="w-16 h-16 text-military-amber mb-4" />
          <h1 className="text-xl font-bold tracking-widest text-center text-white font-sans">INDIAN ARMY</h1>
          <h2 className="text-sm text-military-green tracking-widest text-center mt-1">BORDER SURVEILLANCE COMMAND</h2>
        </div>

        {/* Error / Lockout Banner */}
        {error && (
          <div className={`flex items-start gap-2 text-xs font-mono mb-4 p-3 border ${
            isLocked
              ? 'border-military-red/80 bg-military-red/10 text-military-red'
              : 'border-military-amber/60 bg-military-amber/10 text-military-amber'
          }`}>
            {isLocked ? <Lock className="w-3 h-3 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />}
            <span>{isLocked ? `ACCOUNT LOCKED — Retry in ${countdown}s` : error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative group">
            <div className="absolute inset-0 bg-military-green/20 w-full h-[1px] top-0 group-hover:bg-military-amber transition-colors" />
            <label className="block text-xs text-military-green mb-1 pt-2 uppercase">Officer ID</label>
            <input
              id="officer-id-input" type="text" value={officerId}
              onChange={(e) => setOfficerId(e.target.value)} disabled={isLocked}
              className="w-full bg-transparent border-b border-military-green/50 px-2 py-2 text-white focus:outline-none focus:border-military-amber transition-colors font-mono uppercase disabled:opacity-40 disabled:cursor-not-allowed"
              placeholder="IND-ARMY-XXX" required autoComplete="off"
            />
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-military-green/20 w-full h-[1px] top-0 group-hover:bg-military-amber transition-colors" />
            <label className="block text-xs text-military-green mb-1 pt-2 uppercase">Password</label>
            <input
              id="password-input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} disabled={isLocked}
              className="w-full bg-transparent border-b border-military-green/50 px-2 py-2 text-white focus:outline-none focus:border-military-amber transition-colors font-mono disabled:opacity-40 disabled:cursor-not-allowed"
              placeholder="••••••••" required autoComplete="current-password"
            />
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-military-green/20 w-full h-[1px] top-0 group-hover:bg-military-amber transition-colors" />
            <label className="block text-xs text-military-green mb-1 pt-2 uppercase">Unit Code</label>
            <input
              id="unit-code-input" type="text" value={unitCode}
              onChange={(e) => setUnitCode(e.target.value)} disabled={isLocked}
              className="w-full bg-transparent border-b border-military-green/50 px-2 py-2 text-white focus:outline-none focus:border-military-amber transition-colors font-mono uppercase disabled:opacity-40 disabled:cursor-not-allowed"
              placeholder="SEC-ALPHA" required autoComplete="off"
            />
          </div>

          <button
            id="authenticate-btn" type="submit" disabled={isLocked}
            className="w-full mt-8 bg-military-green/20 border border-military-green text-military-amber py-3 px-4 font-bold tracking-widest hover:bg-military-green/40 hover:text-white transition-all uppercase flex justify-center items-center relative overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="relative z-10">{isLocked ? `LOCKED (${countdown}s)` : 'AUTHENTICATE'}</span>
          </button>
        </form>

        {/* Attempt indicator dots */}
        <div className="flex justify-center gap-1 mt-4">
          {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i < attempts ? 'bg-military-red' : 'bg-gray-700'}`} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Login;
