/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CalculatorView } from './components/CalculatorView';
import { ChatView } from './components/ChatView';
import { AuthModal } from './components/AuthModal';
import { PinSetupScreen } from './components/PinSetupScreen';

function AppContent() {
  const { loading, userAccount, needsPinSetup, activeIdentity } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-neutral-400 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-neutral-700 border-t-emerald-500 animate-spin" />
        <span className="text-xs font-mono text-neutral-500">Initializing CalcChat Vault...</span>
      </div>
    );
  }

  // If authenticated user needs initial PIN setup, render dedicated PinSetupScreen
  if (userAccount && needsPinSetup) {
    return (
      <div className="min-h-screen bg-neutral-950 font-sans antialiased">
        <PinSetupScreen />
        <AuthModal />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 font-sans antialiased">
      {activeIdentity ? <ChatView /> : <CalculatorView />}
      <AuthModal />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
