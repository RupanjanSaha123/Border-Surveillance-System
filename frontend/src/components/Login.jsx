import React, { useState, useEffect, useRef } from 'react';
import { Shield, AlertTriangle, Lock, Loader2, UserPlus, Mail, Key, User, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { login as apiLogin, register as apiRegister, verifyOtp as apiVerifyOtp } from '../api';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

const Login = ({ onLogin }) => {
  // Views: 'login' | 'register' | 'otp'
  const [view, setView] = useState('login');
  
  // Common states
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  
  // Login fields
  const [officerId, setOfficerId]   = useState('');
  const [password, setPassword]     = useState('');
  
  // Register fields
  const [regName, setRegName]       = useState('');
  const [regEmail, setRegEmail]     = useState('');
  const [regId, setRegId]           = useState('');
  const [regPass, setRegPass]       = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  
  // OTP fields
  const [otpCode, setOtpCode]       = useState('');
  const [verifyTargetId, setVerifyTargetId] = useState('');

  // Lockout logic (only for login)
  const [attempts, setAttempts]     = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [countdown, setCountdown]   = useState(0);
  const timerRef = useRef(null);

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

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLocked || loading) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const data = await apiLogin({
        officerId: officerId.trim().toUpperCase(),
        password,
      });

      onLogin({
        officerId:  data.officer_id,
        callSign:   data.call_sign,
        unitCode:   data.unit_code,
        loginTime:  data.login_time,
        token:      data.access_token,
      });
    } catch (err) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_SECONDS * 1000;
        setLockedUntil(until);
        setCountdown(LOCKOUT_SECONDS);
        setError(`⚠ ACCOUNT LOCKED — Too many failed attempts.`);
      } else {
        setError(err.message || `✗ Invalid credentials.`);
      }
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (regPass !== regConfirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await apiRegister({
        name: regName,
        email: regEmail,
        officerId: regId.trim().toUpperCase(),
        password: regPass,
        confirmPassword: regConfirm,
      });

      setSuccess(res.message);
      setVerifyTargetId(regId.toUpperCase());
      setView('otp');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError('');

    try {
      const res = await apiVerifyOtp({
        officerId: verifyTargetId,
        otp: otpCode,
      });

      setSuccess(res.message);
      setTimeout(() => {
        setView('login');
        setOfficerId(verifyTargetId);
        setSuccess('');
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Renderers ─────────────────────────────────────────────────────────────

  const renderLogin = () => (
    <form onSubmit={handleLogin} className="space-y-6">
      <div className="relative group">
        <label className="block text-[10px] text-military-green mb-1 uppercase tracking-widest font-bold">Officer ID</label>
        <div className="flex items-center gap-3 border-b border-military-green/50 focus-within:border-military-amber transition-colors px-1 py-1">
          <User className="w-4 h-4 text-military-green/60" />
          <input
            type="text"
            value={officerId}
            onChange={(e) => setOfficerId(e.target.value)}
            disabled={isLocked}
            className="w-full bg-transparent text-white focus:outline-none font-mono uppercase text-sm"
            placeholder="IND-ARMY-XXX"
            required
            autoComplete="off"
          />
        </div>
      </div>

      <div className="relative group">
        <label className="block text-[10px] text-military-green mb-1 uppercase tracking-widest font-bold">Password</label>
        <div className="flex items-center gap-3 border-b border-military-green/50 focus-within:border-military-amber transition-colors px-1 py-1">
          <Lock className="w-4 h-4 text-military-green/60" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLocked}
            className="w-full bg-transparent text-white focus:outline-none font-mono text-sm"
            placeholder="••••••••"
            required
            autoComplete="new-password"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isLocked || loading}
        className="w-full mt-4 bg-military-green/20 border border-military-green text-military-amber py-3 font-bold tracking-widest hover:bg-military-green/40 transition-all uppercase flex justify-center items-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        {loading ? 'AUTHENTICATING...' : isLocked ? `LOCKED (${countdown}s)` : 'AUTHENTICATE'}
      </button>

      <div className="text-center pt-4 border-t border-military-green/20">
        <button
          type="button"
          onClick={() => { setView('register'); setError(''); setSuccess(''); }}
          className="text-[10px] text-gray-500 hover:text-military-green transition-colors uppercase tracking-widest flex items-center gap-2 mx-auto"
        >
          <UserPlus className="w-3 h-3" /> New Officer Registration
        </button>
      </div>
    </form>
  );

  const renderRegister = () => (
    <form onSubmit={handleRegister} className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div className="group">
          <label className="block text-[10px] text-military-green mb-1 uppercase tracking-widest font-bold">Full Name</label>
          <div className="flex items-center gap-2 border-b border-military-green/50 focus-within:border-military-amber px-1 py-1">
            <User className="w-4 h-4 text-military-green/40" />
            <input
              type="text"
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              className="w-full bg-transparent text-white focus:outline-none text-sm"
              placeholder="Full Name"
              required
              autoComplete="off"
            />
          </div>
        </div>

        <div className="group">
          <label className="block text-[10px] text-military-green mb-1 uppercase tracking-widest font-bold">Email Address</label>
          <div className="flex items-center gap-2 border-b border-military-green/50 focus-within:border-military-amber px-1 py-1">
            <Mail className="w-4 h-4 text-military-green/40" />
            <input
              type="email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              className="w-full bg-transparent text-white focus:outline-none text-sm"
              placeholder="officer@mil.in"
              required
              autoComplete="off"
            />
          </div>
        </div>

        <div className="group">
          <label className="block text-[10px] text-military-green mb-1 uppercase tracking-widest font-bold">Officer ID</label>
          <div className="flex items-center gap-2 border-b border-military-green/50 focus-within:border-military-amber px-1 py-1">
            <Shield className="w-4 h-4 text-military-green/40" />
            <input
              type="text"
              value={regId}
              onChange={(e) => setRegId(e.target.value)}
              className="w-full bg-transparent text-white focus:outline-none font-mono uppercase text-sm"
              placeholder="IND-ARMY-XXX"
              required
              autoComplete="off"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="group">
            <label className="block text-[10px] text-military-green mb-1 uppercase tracking-widest font-bold">Password</label>
            <div className="flex items-center gap-2 border-b border-military-green/50 focus-within:border-military-amber px-1 py-1">
              <Key className="w-4 h-4 text-military-green/40" />
              <input
                type="password"
                value={regPass}
                onChange={(e) => setRegPass(e.target.value)}
                className="w-full bg-transparent text-white focus:outline-none text-sm"
                placeholder="••••"
                required
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="group">
            <label className="block text-[10px] text-military-green mb-1 uppercase tracking-widest font-bold">Confirm</label>
            <div className="flex items-center gap-2 border-b border-military-green/50 focus-within:border-military-amber px-1 py-1">
              <Key className="w-4 h-4 text-military-green/40" />
              <input
                type="password"
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                className="w-full bg-transparent text-white focus:outline-none text-sm"
                placeholder="••••"
                required
              />
            </div>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full mt-6 bg-military-green/20 border border-military-green text-military-amber py-3 font-bold tracking-widest hover:bg-military-green/40 transition-all uppercase flex justify-center items-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
        {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
      </button>

      <button
        type="button"
        onClick={() => { setView('login'); setError(''); setSuccess(''); }}
        className="w-full text-[10px] text-gray-500 hover:text-military-amber transition-colors uppercase tracking-widest flex items-center justify-center gap-2"
      >
        <ArrowLeft className="w-3 h-3" /> Back to Login
      </button>
    </form>
  );

  const renderOtp = () => (
    <form onSubmit={handleVerifyOtp} className="space-y-6">
      <div className="text-center">
        <Mail className="w-12 h-12 text-military-amber mx-auto mb-4 animate-pulse" />
        <h3 className="text-white text-sm font-bold tracking-wider mb-2">VERIFICATION REQUIRED</h3>
        <p className="text-[10px] text-gray-400 font-mono leading-relaxed px-4">
          A 6-digit security code has been transmitted to <span className="text-military-green">{regEmail}</span>. 
          Enter it below to activate your ID: <span className="text-military-amber">{verifyTargetId}</span>
        </p>
      </div>

      <div className="group">
        <label className="block text-[10px] text-military-green mb-1 uppercase tracking-widest font-bold text-center">OTP CODE</label>
        <input
          type="text"
          value={otpCode}
          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0,6))}
          className="w-full bg-black/40 border border-military-green/50 px-4 py-3 text-center text-white text-2xl font-mono tracking-[0.5em] focus:outline-none focus:border-military-amber transition-all"
          placeholder="000000"
          required
          autoFocus
          autoComplete="one-time-code"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-military-green border border-military-green text-black py-3 font-bold tracking-widest hover:bg-military-amber hover:border-military-amber transition-all uppercase flex justify-center items-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        {loading ? 'VERIFYING...' : 'VERIFY & ACTIVATE'}
      </button>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => { setView('register'); setError(''); setSuccess(''); }}
          className="text-[10px] text-gray-600 hover:text-military-amber transition-colors uppercase tracking-widest"
        >
          Incorrect Details? Go Back
        </button>
      </div>
    </form>
  );

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-military-bg overflow-hidden military-scanline font-mono">
      {/* Background Radar Animation */}
      <div className="absolute inset-0 z-0 flex items-center justify-center opacity-10 pointer-events-none">
        <div className="relative w-[1200px] h-[1200px] rounded-full border border-military-green/30">
          <div className="absolute inset-0 rounded-full border border-military-green/10 m-[200px]"></div>
          <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] origin-top-left"
            style={{ background: 'conic-gradient(from 0deg, transparent 80%, rgba(74, 103, 65, 0.4) 100%)', animation: 'radar-sweep 8s linear infinite' }}></div>
        </div>
      </div>

      {/* Auth Panel */}
      <div className="relative z-10 bg-military-panel border border-military-green/40 p-8 shadow-2xl w-full max-w-sm backdrop-blur-sm">
        {/* Decorative corner brackets */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-military-amber"></div>
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-military-amber"></div>
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-military-amber"></div>
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-military-amber"></div>

        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <Shield className="w-16 h-16 text-military-amber" />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-military-red rounded-full animate-pulse border-2 border-military-panel"></div>
          </div>
          <h1 className="text-xl font-bold tracking-[0.2em] text-center text-white font-sans">BSC — DOP</h1>
          <h2 className="text-[9px] text-military-green tracking-[0.3em] text-center mt-1 uppercase">Tactical Auth Gateway</h2>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="flex items-start gap-2 text-[10px] mb-6 p-3 border border-military-red/50 bg-military-red/10 text-military-red">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2 text-[10px] mb-6 p-3 border border-military-green/50 bg-military-green/10 text-military-green">
            <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Dynamic Views */}
        {view === 'login' && renderLogin()}
        {view === 'register' && renderRegister()}
        {view === 'otp' && renderOtp()}

        {/* Attempt indicator (only for login) */}
        {view === 'login' && (
          <div className="flex justify-center gap-1.5 mt-8">
            {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 transition-all ${
                  i < attempts ? 'bg-military-red shadow-[0_0_5px_rgba(185,28,28,0.5)]' : 'bg-gray-800'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
