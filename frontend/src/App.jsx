import React, { useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

function App() {
  // SECURITY FIX: Always start unauthenticated — never skip the login gate
  const [session, setSession] = useState(null);

  const handleLogin = (operatorSession) => {
    setSession(operatorSession);
  };

  const handleLogout = () => {
    setSession(null);
  };

  return (
    <div className="w-screen h-screen bg-military-bg text-white font-mono overflow-hidden">
      {session ? (
        <Dashboard session={session} onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;
