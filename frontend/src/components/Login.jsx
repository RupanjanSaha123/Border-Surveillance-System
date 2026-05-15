import React, { useState } from 'react';
import { Shield } from 'lucide-react';

const Login = ({ onLogin }) => {
  const [officerId, setOfficerId] = useState('');
  const [password, setPassword] = useState('');
  const [unitCode, setUnitCode] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (officerId && password && unitCode) {
      onLogin();
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-military-bg overflow-hidden military-scanline">
      {/* Background Radar Animation */}
      <div className="absolute inset-0 z-0 flex items-center justify-center opacity-20 pointer-events-none">
        <div className="relative w-[800px] h-[800px] rounded-full border border-military-green/30">
          <div className="absolute inset-0 rounded-full border border-military-green/20 m-[100px]"></div>
          <div className="absolute inset-0 rounded-full border border-military-green/10 m-[200px]"></div>
          <div className="absolute inset-0 rounded-full border border-military-green/5 m-[300px]"></div>
          <div className="absolute top-1/2 left-0 right-0 h-px bg-military-green/20"></div>
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-military-green/20"></div>
          
          <div 
            className="absolute top-1/2 left-1/2 w-[400px] h-[400px] origin-top-left"
            style={{
              background: 'conic-gradient(from 0deg, transparent 70%, rgba(74, 103, 65, 0.8) 100%)',
              animation: 'radar-sweep 4s linear infinite'
            }}
          ></div>
        </div>
      </div>

      {/* Login Panel */}
      <div className="relative z-10 bg-military-panel border border-military-green p-8 shadow-2xl w-full max-w-md">
        {/* Decorative corner brackets */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-military-amber"></div>
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-military-amber"></div>
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-military-amber"></div>
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-military-amber"></div>

        <div className="flex flex-col items-center mb-8">
          <Shield className="w-16 h-16 text-military-amber mb-4" />
          <h1 className="text-xl font-bold tracking-widest text-center text-white font-sans">
            INDIAN ARMY
          </h1>
          <h2 className="text-sm text-military-green tracking-widest text-center mt-1">
            BORDER SURVEILLANCE COMMAND
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative group">
            <div className="absolute inset-0 bg-military-green/20 w-full h-[1px] top-0 group-hover:bg-military-amber transition-colors"></div>
            <label className="block text-xs text-military-green mb-1 pt-2 uppercase">Officer ID</label>
            <input 
              type="text" 
              value={officerId}
              onChange={(e) => setOfficerId(e.target.value)}
              className="w-full bg-transparent border-b border-military-green/50 px-2 py-2 text-white focus:outline-none focus:border-military-amber transition-colors font-mono uppercase"
              placeholder="IND-ARMY-XXX"
              required
            />
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-military-green/20 w-full h-[1px] top-0 group-hover:bg-military-amber transition-colors"></div>
            <label className="block text-xs text-military-green mb-1 pt-2 uppercase">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent border-b border-military-green/50 px-2 py-2 text-white focus:outline-none focus:border-military-amber transition-colors font-mono"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-military-green/20 w-full h-[1px] top-0 group-hover:bg-military-amber transition-colors"></div>
            <label className="block text-xs text-military-green mb-1 pt-2 uppercase">Unit Code</label>
            <input 
              type="text" 
              value={unitCode}
              onChange={(e) => setUnitCode(e.target.value)}
              className="w-full bg-transparent border-b border-military-green/50 px-2 py-2 text-white focus:outline-none focus:border-military-amber transition-colors font-mono uppercase"
              placeholder="SEC-ALPHA"
              required
            />
          </div>

          <button 
            type="submit" 
            className="w-full mt-8 bg-military-green/20 border border-military-green text-military-amber py-3 px-4 font-bold tracking-widest hover:bg-military-green/40 hover:text-white transition-all uppercase flex justify-center items-center group relative overflow-hidden"
          >
            <span className="relative z-10">AUTHENTICATE</span>
            <div className="absolute left-0 w-full h-px bg-military-amber top-0 -translate-y-full group-hover:animate-[scanline_1s_linear_infinite]"></div>
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
