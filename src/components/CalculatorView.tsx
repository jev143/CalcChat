import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Delete,
  Shield,
  User,
  KeyRound,
  LogOut,
  Sparkles,
  Wifi,
  Battery,
  Settings,
  HelpCircle,
  AlertCircle,
} from 'lucide-react';

export const CalculatorView: React.FC = () => {
  const {
    user,
    userAccount,
    firstIdentity,
    secondIdentity,
    setAuthModalOpen,
    unlockWithPin,
    logout,
  } = useAuth();

  const [inputBuffer, setInputBuffer] = useState<string>('0');
  const [historyExpression, setHistoryExpression] = useState<string>('');
  const [justCalculated, setJustCalculated] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [showHelperTooltip, setShowHelperTooltip] = useState<boolean>(false);
  const [pinErrorMessage, setPinErrorMessage] = useState<string | null>(null);

  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update clock in realistic status bar
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  const clearErrorTimer = () => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
  };

  // Append a character or symbol to the input buffer
  const appendChar = useCallback(
    (char: string) => {
      clearErrorTimer();
      setPinErrorMessage(null);

      setInputBuffer((prev) => {
        if (prev === 'Invalid PIN' || prev === 'Error' || prev === 'NaN') {
          return char;
        }
        if (justCalculated) {
          setJustCalculated(false);
          // If starting with an operator, continue with previous result; else start new
          if (['+', '-', '×', '÷', '*', '/', '%'].includes(char)) {
            return prev + ' ' + char + ' ';
          }
          return char;
        }
        if (prev === '0') {
          if (['+', '-', '×', '÷', '*', '/', '%'].includes(char)) {
            return char;
          }
          if (char === '.') {
            return '0.';
          }
          return char;
        }

        // Add space around operators for visual clarity in math
        if (['+', '-', '×', '÷'].includes(char)) {
          // If ends with an operator, replace it
          const trimmed = prev.trim();
          if (['+', '-', '×', '÷', '*', '/'].some((op) => trimmed.endsWith(op))) {
            return trimmed.slice(0, -1).trim() + ' ' + char + ' ';
          }
          return prev + ' ' + char + ' ';
        }

        return prev + char;
      });
    },
    [justCalculated]
  );

  // Handle Clear All
  const clearAll = useCallback(() => {
    clearErrorTimer();
    setPinErrorMessage(null);
    setInputBuffer('0');
    setHistoryExpression('');
    setJustCalculated(false);
  }, []);

  // Handle Backspace
  const handleBackspace = useCallback(() => {
    clearErrorTimer();
    setPinErrorMessage(null);

    setInputBuffer((prev) => {
      if (prev.length <= 1 || prev === 'Error' || prev === 'Invalid PIN' || prev === 'NaN') {
        return '0';
      }
      const trimmed = prev.trim();
      if (trimmed.endsWith(' +') || trimmed.endsWith(' -') || trimmed.endsWith(' ×') || trimmed.endsWith(' ÷')) {
        return trimmed.slice(0, -2).trim() || '0';
      }
      return prev.slice(0, -1).trim() || '0';
    });
  }, []);

  // Handle +/- Toggle
  const toggleSign = useCallback(() => {
    setInputBuffer((prev) => {
      if (prev === '0' || prev === 'Error' || prev === 'Invalid PIN') return prev;
      if (prev.startsWith('-')) {
        return prev.slice(1);
      }
      return '-' + prev;
    });
  }, []);

  // Safely evaluate standard arithmetic expressions
  const evaluateMathExpression = (expr: string): number | null => {
    try {
      // Normalize operators: replace × with *, ÷ with /, % with % (modulo) or *0.01
      let sanitized = expr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/−/g, '-');

      // Check if expression contains only valid mathematical symbols & numbers
      if (!/^[0-9+\-*/%().\s]+$/.test(sanitized)) {
        return null;
      }

      // Handle simple percent calculations if needed
      // eslint-disable-next-line no-eval
      const result = Function(`'use strict'; return (${sanitized})`)();

      if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
        return Math.round(result * 1e10) / 1e10;
      }
      return null;
    } catch {
      return null;
    }
  };

  // Equals / Identity Secret Unlock Handler
  const handleEquals = useCallback(async () => {
    clearErrorTimer();
    const rawValue = inputBuffer.trim();
    if (rawValue === 'Invalid PIN' || rawValue === 'Error') {
      setInputBuffer('0');
      return;
    }

    // 1. Prepare normalized candidate secret for identity unlock
    // Replace visual symbols (× -> *, ÷ -> /, − -> -) and remove internal spaces
    const normalizedSecret = rawValue
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/\s+/g, '');

    // 2. Check Identity Unlock Secrets (First & Second)
    if (userAccount && normalizedSecret.length >= 4 && normalizedSecret.length <= 10) {
      const unlocked = await unlockWithPin(normalizedSecret);
      if (unlocked) {
        // Successfully unlocked First or Second Chat!
        setInputBuffer('0');
        setHistoryExpression('');
        return;
      }
    }

    // 3. If not an unlocked secret, evaluate standard math calculation (e.g. 10 + 20 =, 50 - 20 =, 5 * 6 =, 20 / 4 =)
    const mathResult = evaluateMathExpression(rawValue);

    if (mathResult !== null) {
      setHistoryExpression(`${rawValue} =`);
      setInputBuffer(String(mathResult));
      setJustCalculated(true);
      return;
    }

    // 4. If neither a valid secret nor a valid math expression, show "Invalid PIN" and reset
    setInputBuffer('Invalid PIN');
    setPinErrorMessage('Invalid PIN. Clear and enter your configured secret.');
    errorTimeoutRef.current = setTimeout(() => {
      setInputBuffer('0');
      setPinErrorMessage(null);
    }, 1500);
  }, [inputBuffer, userAccount, unlockWithPin]);

  // Keyboard support for natural typing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if an input or modal is active
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        appendChar(e.key);
      } else if (e.key === '.') {
        appendChar('.');
      } else if (e.key === '+') {
        appendChar('+');
      } else if (e.key === '-') {
        appendChar('-');
      } else if (e.key === '*') {
        appendChar('*');
      } else if (e.key === '/') {
        e.preventDefault();
        appendChar('÷');
      } else if (e.key === '%') {
        appendChar('%');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEquals();
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        clearAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appendChar, handleEquals, handleBackspace, clearAll]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-3 sm:p-6 selection:bg-neutral-800">
      {/* Top Application Bar */}
      <header className="w-full max-w-sm mb-3 flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-neutral-900 border border-neutral-800 flex items-center justify-center text-xs font-mono font-bold text-neutral-400">
            C
          </div>
          <span className="text-xs font-medium tracking-wide text-neutral-400">CalcChat</span>
        </div>

        {/* Account / Stealth State Controller */}
        <div className="flex items-center gap-2">
          {userAccount ? (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-2 bg-neutral-900/90 border border-neutral-800 rounded-full pl-1.5 pr-2.5 py-1 text-xs">
                <img
                  src={userAccount.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Shadow'}
                  alt="Account"
                  className="w-5 h-5 rounded-full object-cover border border-neutral-700"
                />
                <span className="text-neutral-300 font-mono font-medium truncate max-w-[90px]">
                  @{userAccount.accountCode || 'user'}
                </span>
              </div>
              <button
                id="calc-logout-btn"
                onClick={logout}
                title="Sign out of account"
                className="p-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-red-400 hover:border-red-500/30 transition-all cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              id="calc-signin-btn"
              onClick={() => setAuthModalOpen(true)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm transition-all cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              <span>Login / Register</span>
            </button>
          )}

          <button
            id="calc-help-btn"
            onClick={() => setShowHelperTooltip(!showHelperTooltip)}
            title="How to unlock chats"
            className="p-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-neutral-200 transition-all cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Helper guide dropdown (discreet instructions) */}
      {showHelperTooltip && (
        <div className="w-full max-w-sm mb-3 p-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-300 space-y-2 shadow-xl animate-in fade-in">
          <div className="flex items-center justify-between font-semibold text-neutral-200">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <KeyRound className="w-3.5 h-3.5" /> Identity Unlock Guide
            </span>
            <button onClick={() => setShowHelperTooltip(false)} className="text-neutral-500 hover:text-neutral-300">
              ✕
            </button>
          </div>
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            1. Sign in with your <strong>Unique Account Code & Password</strong>.
            <br />
            2. Enter your <strong>First Identity Secret</strong> and press <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 font-mono text-emerald-400">=</kbd> to unlock <strong>First Chat</strong>.
            <br />
            3. Enter your <strong>Second Identity Secret</strong> and press <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 font-mono text-sky-400">=</kbd> to unlock <strong>Second Chat</strong>.
            <br />
            4. Normal math calculations (e.g. <code>10 + 20 =</code>, <code>5 * 6 =</code>) calculate normally.
          </p>
        </div>
      )}

      {/* Calculator Body (Sleek Modern Hardware Vibe) */}
      <main
        id="calculator-main-device"
        className="w-full max-w-sm bg-neutral-900/95 border border-neutral-800 rounded-3xl p-4 sm:p-5 shadow-2xl backdrop-blur-xl flex flex-col gap-3"
      >
        {/* Device Status Bar */}
        <div className="flex items-center justify-between text-[11px] text-neutral-500 font-medium px-1 pt-0.5 select-none">
          <span>{currentTime || '12:00'}</span>
          <div className="flex items-center gap-2">
            <Wifi className="w-3 h-3" />
            <Battery className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Display Screen */}
        <div
          id="calc-display-screen"
          className="w-full bg-neutral-950/80 border border-neutral-800/80 rounded-2xl p-4 flex flex-col items-end justify-end min-h-[110px] overflow-hidden relative"
        >
          {/* Expression / history line */}
          <div className="text-xs font-mono text-neutral-500 h-5 overflow-hidden text-ellipsis whitespace-nowrap">
            {historyExpression || ' '}
          </div>
          {/* Main output */}
          <div
            id="calc-display-value"
            className={`text-3xl sm:text-4xl font-light font-mono tracking-tight overflow-x-auto w-full text-right select-all ${
              inputBuffer === 'Invalid PIN' ? 'text-red-400 text-2xl font-medium' : 'text-neutral-100'
            }`}
          >
            {inputBuffer}
          </div>
        </div>

        {/* Keypad Grid */}
        <div id="calc-keypad" className="grid grid-cols-4 gap-2.5 pt-1 select-none">
          {/* Row 1: AC, Backspace, %, ÷ */}
          <button
            id="btn-clear"
            type="button"
            onClick={clearAll}
            className="h-14 rounded-2xl bg-neutral-800 hover:bg-neutral-750 active:scale-95 text-neutral-300 text-base font-medium transition-all flex items-center justify-center cursor-pointer"
          >
            AC
          </button>
          <button
            id="btn-backspace"
            type="button"
            onClick={handleBackspace}
            className="h-14 rounded-2xl bg-neutral-800 hover:bg-neutral-750 active:scale-95 text-neutral-300 text-base font-medium transition-all flex items-center justify-center cursor-pointer"
          >
            <Delete className="w-5 h-5" />
          </button>
          <button
            id="btn-percent"
            type="button"
            onClick={() => appendChar('%')}
            className="h-14 rounded-2xl bg-neutral-800 hover:bg-neutral-750 active:scale-95 text-neutral-300 text-base font-medium transition-all flex items-center justify-center cursor-pointer"
          >
            %
          </button>
          <button
            id="btn-divide"
            type="button"
            onClick={() => appendChar('÷')}
            className="h-14 rounded-2xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-xl font-medium transition-all flex items-center justify-center shadow-lg shadow-amber-950/20 cursor-pointer"
          >
            ÷
          </button>

          {/* Row 2: 7, 8, 9, × */}
          <button
            id="btn-7"
            type="button"
            onClick={() => appendChar('7')}
            className="h-14 rounded-2xl bg-neutral-800/80 hover:bg-neutral-700 active:scale-95 text-neutral-100 text-xl font-normal transition-all flex items-center justify-center cursor-pointer"
          >
            7
          </button>
          <button
            id="btn-8"
            type="button"
            onClick={() => appendChar('8')}
            className="h-14 rounded-2xl bg-neutral-800/80 hover:bg-neutral-700 active:scale-95 text-neutral-100 text-xl font-normal transition-all flex items-center justify-center cursor-pointer"
          >
            8
          </button>
          <button
            id="btn-9"
            type="button"
            onClick={() => appendChar('9')}
            className="h-14 rounded-2xl bg-neutral-800/80 hover:bg-neutral-700 active:scale-95 text-neutral-100 text-xl font-normal transition-all flex items-center justify-center cursor-pointer"
          >
            9
          </button>
          <button
            id="btn-multiply"
            type="button"
            onClick={() => appendChar('×')}
            className="h-14 rounded-2xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-xl font-medium transition-all flex items-center justify-center shadow-lg shadow-amber-950/20 cursor-pointer"
          >
            ×
          </button>

          {/* Row 3: 4, 5, 6, - */}
          <button
            id="btn-4"
            type="button"
            onClick={() => appendChar('4')}
            className="h-14 rounded-2xl bg-neutral-800/80 hover:bg-neutral-700 active:scale-95 text-neutral-100 text-xl font-normal transition-all flex items-center justify-center cursor-pointer"
          >
            4
          </button>
          <button
            id="btn-5"
            type="button"
            onClick={() => appendChar('5')}
            className="h-14 rounded-2xl bg-neutral-800/80 hover:bg-neutral-700 active:scale-95 text-neutral-100 text-xl font-normal transition-all flex items-center justify-center cursor-pointer"
          >
            5
          </button>
          <button
            id="btn-6"
            type="button"
            onClick={() => appendChar('6')}
            className="h-14 rounded-2xl bg-neutral-800/80 hover:bg-neutral-700 active:scale-95 text-neutral-100 text-xl font-normal transition-all flex items-center justify-center cursor-pointer"
          >
            6
          </button>
          <button
            id="btn-subtract"
            type="button"
            onClick={() => appendChar('-')}
            className="h-14 rounded-2xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-xl font-medium transition-all flex items-center justify-center shadow-lg shadow-amber-950/20 cursor-pointer"
          >
            −
          </button>

          {/* Row 4: 1, 2, 3, + */}
          <button
            id="btn-1"
            type="button"
            onClick={() => appendChar('1')}
            className="h-14 rounded-2xl bg-neutral-800/80 hover:bg-neutral-700 active:scale-95 text-neutral-100 text-xl font-normal transition-all flex items-center justify-center cursor-pointer"
          >
            1
          </button>
          <button
            id="btn-2"
            type="button"
            onClick={() => appendChar('2')}
            className="h-14 rounded-2xl bg-neutral-800/80 hover:bg-neutral-700 active:scale-95 text-neutral-100 text-xl font-normal transition-all flex items-center justify-center cursor-pointer"
          >
            2
          </button>
          <button
            id="btn-3"
            type="button"
            onClick={() => appendChar('3')}
            className="h-14 rounded-2xl bg-neutral-800/80 hover:bg-neutral-700 active:scale-95 text-neutral-100 text-xl font-normal transition-all flex items-center justify-center cursor-pointer"
          >
            3
          </button>
          <button
            id="btn-add"
            type="button"
            onClick={() => appendChar('+')}
            className="h-14 rounded-2xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-xl font-medium transition-all flex items-center justify-center shadow-lg shadow-amber-950/20 cursor-pointer"
          >
            +
          </button>

          {/* Row 5: ±, 0, ., = */}
          <button
            id="btn-sign"
            type="button"
            onClick={toggleSign}
            className="h-14 rounded-2xl bg-neutral-800 hover:bg-neutral-750 active:scale-95 text-neutral-300 text-base font-normal transition-all flex items-center justify-center cursor-pointer"
          >
            ±
          </button>
          <button
            id="btn-0"
            type="button"
            onClick={() => appendChar('0')}
            className="h-14 rounded-2xl bg-neutral-800/80 hover:bg-neutral-700 active:scale-95 text-neutral-100 text-xl font-normal transition-all flex items-center justify-center cursor-pointer"
          >
            0
          </button>
          <button
            id="btn-decimal"
            type="button"
            onClick={() => appendChar('.')}
            className="h-14 rounded-2xl bg-neutral-800/80 hover:bg-neutral-700 active:scale-95 text-neutral-100 text-xl font-normal transition-all flex items-center justify-center cursor-pointer"
          >
            .
          </button>
          <button
            id="btn-equals"
            type="button"
            onClick={handleEquals}
            className="h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-2xl font-medium transition-all flex items-center justify-center shadow-lg shadow-emerald-950/30 cursor-pointer"
          >
            =
          </button>
        </div>
      </main>

      {/* Subtle footer */}
      <footer className="mt-4 text-center text-xs text-neutral-500 max-w-sm">
        {user ? (
          <span>Enter your identity secret & tap <strong className="text-neutral-400">=</strong> to unlock your chat identity.</span>
        ) : (
          <span>CalcChat disguised messenger with dual identity security.</span>
        )}
      </footer>
    </div>
  );
};
