import React from 'react';
import type { AppView } from '../types';

interface HeaderProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onOpenSettings?: () => void;
  scanActive?: boolean;
  theme?: string;
  // Legacy props support
  setView?: (view: AppView) => void;
  onRescan?: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  currentView, 
  onNavigate, 
  onOpenSettings,
  scanActive,
  theme = 'dark',
  setView,
  onRescan: _onRescan 
}) => {
  const handleNavigate = (view: AppView) => {
    if (onNavigate) onNavigate(view);
    else if (setView) setView(view);
  };

  const isContrast = theme === 'contrast';
  const isHome = currentView === 'HOME';

  return (
    <header className={`sticky top-0 z-[100] w-full border-b transition-all duration-300 ${
      isContrast 
        ? 'bg-black border-white border-b-2' 
        : 'glass border-slate-200 dark:border-slate-800'
    }`}>
      <div className="max-w-[1400px] mx-auto px-8 h-20 flex items-center justify-between">
        <div className="flex items-center gap-12">
          <div 
            className="flex items-center gap-5 cursor-pointer group" 
            onClick={() => !scanActive && handleNavigate('HOME')}
          >
            <div className="w-12 h-12 flex items-center justify-center transition-all group-hover:scale-105 group-hover:-rotate-3">
              <img src="/Main-logo.png" alt="DiskSight Logo" className="app-logo w-full h-full object-contain" />
            </div>
            <div className="flex flex-col gap-0.5">
              <h1 className={`text-xl font-black tracking-tighter leading-tight ${isContrast ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                DiskSight
              </h1>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Disk cleanup</span>
            </div>
          </div>

          {!isHome && (
            <div className="hidden xl:flex items-center relative">
              <span className="material-symbols-outlined absolute left-4 text-slate-400 text-lg">search</span>
              <input 
                className={`h-12 w-96 pl-12 pr-4 text-sm font-medium rounded-xl border transition-all focus:outline-none focus:ring-4 ${
                  isContrast 
                    ? 'bg-black border-white text-white focus:ring-white' 
                    : 'bg-slate-100 dark:bg-slate-900/50 border-transparent focus:bg-white dark:focus:bg-slate-900 border-slate-200 dark:border-slate-700 focus:ring-secondary/10'
                }`}
                placeholder="Search files" 
                type="text"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-10">
          <nav className="hidden md:flex items-center gap-10 text-[12px] font-black uppercase tracking-widest">
            <button 
              onClick={() => !scanActive && handleNavigate('DASHBOARD')}
              className={`transition-colors py-2 hover:text-secondary ${currentView === 'DASHBOARD' ? 'text-secondary' : 'text-slate-500 dark:text-slate-400'}`}
              disabled={scanActive}
            >
              Analytics
            </button>
          </nav>
          
          <div className={`h-8 w-px hidden md:block ${isContrast ? 'bg-white' : 'bg-slate-200 dark:bg-slate-800'}`}></div>

          <div className="flex items-center gap-6">
            <button
              onClick={() => onOpenSettings?.()}
              title="Settings"
              aria-label="Settings"
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-secondary ${currentView === 'SETTINGS' ? 'text-secondary' : 'text-slate-500 dark:text-slate-400'}`}
            >
              <span className="material-symbols-outlined text-lg">settings</span>
            </button>

            {!isHome && !scanActive && (
              <button 
                onClick={() => handleNavigate('HOME')}
                className={`h-12 px-8 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-3 transition-all active:scale-95 ${
                  isContrast 
                    ? 'bg-white text-black' 
                    : 'bg-secondary text-white shadow-lg shadow-secondary/20 hover:brightness-110'
                }`}
              >
                <span className="material-symbols-outlined text-xl">refresh</span>
                <span className="hidden sm:inline">New Scan</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
