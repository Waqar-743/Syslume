import React from 'react';
import type { RootEntry } from '../types';
import { FORMAT_SIZE } from '../constants';

interface HomeViewProps {
  onSelectDrive: (drive: RootEntry) => void;
  drives: RootEntry[];
  isLoading?: boolean;
}

const HomeView: React.FC<HomeViewProps> = ({ onSelectDrive, drives, isLoading }) => {
  const handleStartScan = (path?: string) => {
    if (path) {
      const drive = drives.find(d => d.path === path);
      if (drive) onSelectDrive(drive);
    } else if (drives.length > 0) {
      onSelectDrive(drives[0]);
    }
  };

  return (
    <div className="app-shell flex-1 w-full max-w-6xl mx-auto px-8 py-14 lg:py-20 flex flex-col items-center min-h-screen">
      <div className="text-center max-w-4xl mb-16">
        <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[0.95] mb-6 text-slate-900 dark:text-white">
          Find large files and clear safe clutter.
        </h1>
        <p className="text-slate-500 dark:text-slate-300 text-base md:text-lg font-medium leading-relaxed max-w-2xl mx-auto mt-4">
          Scan a drive, review what uses the most space, and delete safe files without leaving the app.
        </p>
      </div>

      <div className="w-full grid md:grid-cols-3 gap-6 mb-16">
        <button 
          onClick={() => handleStartScan()}
          disabled={isLoading || drives.length === 0}
          className="group relative overflow-hidden bg-primary text-slate-950 dark:text-white p-8 rounded-[2rem] shadow-2xl shadow-primary/30 transition-all hover:scale-[1.02] active:scale-95 text-left flex flex-col justify-between h-64 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="absolute -top-6 -right-6 p-12 opacity-15 dark:opacity-10 transition-transform group-hover:scale-125 group-hover:rotate-12">
            <span className="material-symbols-outlined text-[8rem]">analytics</span>
          </div>
          <span className="material-symbols-outlined text-3xl mb-6 bg-black/10 dark:bg-white/20 p-3 rounded-2xl backdrop-blur-md w-fit shadow-lg text-slate-950 dark:text-white">speed</span>
          <div>
            <h3 className="text-xl font-black mb-3">Scan Drive</h3>
            <p className="text-slate-900/80 dark:text-white/75 text-sm font-medium leading-relaxed">Map the largest folders and files fast.</p>
          </div>
        </button>

        <button 
          onClick={() => handleStartScan()}
          disabled={isLoading || drives.length === 0}
          className="group relative overflow-hidden bg-secondary text-slate-950 dark:text-white p-8 rounded-[2rem] shadow-2xl shadow-secondary/30 transition-all hover:scale-[1.02] active:scale-95 text-left flex flex-col justify-between h-64 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="absolute -top-6 -right-6 p-12 opacity-15 dark:opacity-10 transition-transform group-hover:scale-125">
            <span className="material-symbols-outlined text-[8rem]">auto_delete</span>
          </div>
          <span className="material-symbols-outlined text-3xl mb-6 bg-black/10 dark:bg-white/20 p-3 rounded-2xl backdrop-blur-md w-fit shadow-lg text-slate-950 dark:text-white">cleaning_services</span>
          <div>
            <h3 className="text-xl font-black mb-3">Safe Cleanup</h3>
            <p className="text-slate-900/80 dark:text-white/75 text-sm font-medium leading-relaxed">Delete temporary files while protected system paths stay blocked.</p>
          </div>
        </button>

        <button 
          onClick={() => handleStartScan()}
          disabled={isLoading || drives.length === 0}
          className="app-surface group relative overflow-hidden p-8 rounded-[2rem] shadow-xl transition-all hover:scale-[1.02] active:scale-95 text-left flex flex-col justify-between h-64 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="absolute -top-6 -right-6 p-12 text-slate-100 dark:text-slate-800 transition-transform group-hover:scale-110">
            <span className="material-symbols-outlined text-[8rem]">folder_managed</span>
          </div>
          <span className="material-symbols-outlined text-3xl mb-6 text-primary bg-slate-50 dark:bg-slate-800 p-3 rounded-2xl w-fit shadow-sm">folder_open</span>
          <div>
            <h3 className="text-xl font-black mb-3 text-slate-900 dark:text-white">Review Results</h3>
            <p className="text-slate-500 dark:text-slate-300 text-sm font-medium leading-relaxed">Open folders, inspect file sizes, and delete from the list.</p>
          </div>
        </button>
      </div>

      {/* Drive Selection */}
      {drives.length > 0 && (
        <div className="w-full max-w-4xl mb-10">
          <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-600 flex items-center gap-4 mb-6 px-4">
            <span className="w-2 h-6 bg-primary/50 rounded-full"></span>
            Drives
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {drives.map((drive) => {
              const usedBytes = drive.total_bytes - drive.available_bytes;
              const usedPercent = drive.total_bytes > 0 ? (usedBytes / drive.total_bytes) * 100 : 0;
              return (
                <button
                  key={drive.path}
                  onClick={() => onSelectDrive(drive)}
                  className="flex flex-col p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-secondary/40 transition-all group cursor-pointer shadow-sm hover:shadow-xl hover:shadow-secondary/5"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 group-hover:bg-secondary/10 group-hover:text-secondary transition-colors">
                      <span className="material-symbols-outlined text-2xl">hard_drive</span>
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="font-bold text-slate-900 dark:text-white">{drive.name || 'Local Disk'}</span>
                      <span className="text-xs text-slate-400 font-mono">{drive.path}</span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        usedPercent > 90 ? 'bg-red-500' : usedPercent > 70 ? 'bg-amber-500' : 'bg-secondary'
                      }`}
                      style={{ width: `${usedPercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>{FORMAT_SIZE(usedBytes)} used</span>
                    <span>{FORMAT_SIZE(drive.available_bytes)} free</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeView;
