import React, { useState, useEffect } from 'react';
import type { ScanProgressPayload } from '../types';

interface ScanningViewProps {
  progress: ScanProgressPayload | null;
  targetPath?: string;
  rootPath?: string | null;
  errorMessage?: string | null;
  scanErrors?: string[];
  totalDriveBytes?: number;
  onCancel: () => void;
}

const ScanningView: React.FC<ScanningViewProps> = ({ progress, targetPath: _targetPath, rootPath, errorMessage, scanErrors = [], totalDriveBytes, onCancel }) => {
  const objects = progress?.visited_entries ?? 0;
  const visitedBytes = progress?.visited_bytes_approx ?? 0;
  const volumeGb = visitedBytes / (1024 * 1024 * 1024);
  const currentFile = progress?.current_path ?? 'Initializing scan engine...';
  const phase = progress?.phase ?? 'initializing';
  
  // State to track progress animation
  const [animProgress, setAnimProgress] = useState(0);
  
  // Calculate progress percentage based on visited bytes vs total drive bytes
  // If totalDriveBytes is not available, estimate based on objects count
  const calculateProgress = () => {
    if (phase === 'finalizing') return 99;
    if (phase === 'initializing' || objects === 0) return 0;
    
    // If we have drive size, calculate based on bytes scanned
    if (totalDriveBytes && totalDriveBytes > 0) {
      // Estimate ~70% of disk is used typically
      const estimatedUsedBytes = totalDriveBytes * 0.7;
      const rawPercent = (visitedBytes / estimatedUsedBytes) * 100;
      return Math.min(95, Math.max(1, rawPercent)); // Cap at 95% until finalizing
    }
    
    // Fallback: estimate based on time and entry count growth rate
    // Most scans complete within 10000-100000 entries for typical directories
    const estimatedTotalEntries = 50000; // Conservative estimate
    const rawPercent = (objects / estimatedTotalEntries) * 100;
    return Math.min(95, Math.max(1, rawPercent)); // Cap at 95% until finalizing
  };
  
  const percent = calculateProgress();
  
  // Smooth animation for progress bar
  useEffect(() => {
    const target = percent;
    const step = () => {
      setAnimProgress(prev => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.5) return target;
        return prev + diff * 0.1;
      });
    };
    const interval = setInterval(step, 50);
    return () => clearInterval(interval);
  }, [percent]);

  return (
    <div className="app-shell flex-1 flex flex-col items-center justify-center p-8 min-h-screen">
      <div className="w-full max-w-2xl flex flex-col items-center">
        
        {/* Technical Spinner */}
        <div className="relative mb-16">
          <div className="w-32 h-32 rounded-full border-[6px] border-slate-100 dark:border-slate-800 flex items-center justify-center relative overflow-hidden">
            <div 
              className="absolute inset-[-6px] rounded-full border-[6px] border-transparent border-t-secondary animate-spin"
              style={{ animationDuration: '0.8s' }}
            ></div>
            <img src="/Optimization.png" alt="Scanning..." className="w-20 h-20 object-contain animate-pulse" />
          </div>
        </div>

        <div className="text-center mb-12 space-y-4">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Spatial Analysis Active</h2>
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-secondary">Indexing Registry</span>
            <p className="text-slate-400 font-mono text-xs max-w-md mx-auto truncate px-4 py-2 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 w-full text-center">
              {currentFile}
            </p>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Phase: {phase}</span>
          </div>
        </div>

        {/* Precision Progress Bar */}
        <div className="w-full space-y-3 mb-16">
          <div className="flex justify-between items-end px-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Core Engine Progress</span>
            <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              {Math.floor(animProgress)}
              <span className="text-xs text-slate-400 font-bold ml-0.5">%</span>
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden relative shadow-inner border border-slate-300/20 dark:border-white/5">
            <div 
              className="absolute top-0 left-0 h-full bg-secondary transition-all duration-300 ease-out shadow-[0_0_15px_rgba(26,99,99,0.4)]"
              style={{ width: `${animProgress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent"></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-12 w-full max-w-md mb-16">
          <div className="text-center space-y-1">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 block">Objects Discovered</span>
            <span className="text-3xl font-black tabular-nums tracking-tight text-slate-900 dark:text-white">{objects.toLocaleString()}</span>
          </div>
          <div className="text-center space-y-1 border-l border-slate-200 dark:border-slate-800">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 block">Current Volume</span>
            <span className="text-3xl font-black tabular-nums tracking-tight text-slate-900 dark:text-white">{volumeGb.toFixed(2)} <span className="text-sm font-bold text-slate-400">GB</span></span>
          </div>
        </div>

        {rootPath && (
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-8">
            Root: <span className="font-mono normal-case tracking-normal text-slate-500">{rootPath}</span>
          </div>
        )}

        {scanErrors.length > 0 && (
          <div className="w-full max-w-md mb-8 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
              <span className="material-symbols-outlined text-sm">warning</span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                {scanErrors.length} Access Warnings (scan continues)
              </span>
            </div>
            <p className="text-[10px] text-amber-500 dark:text-amber-500/80 font-mono truncate">
              {scanErrors[scanErrors.length - 1]}
            </p>
          </div>
        )}

        {errorMessage && (
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-500 mb-8">
            Error: <span className="font-mono normal-case tracking-normal text-red-400">{errorMessage}</span>
          </div>
        )}

        <button 
          onClick={onCancel}
          className="group flex items-center gap-3 px-8 py-3 rounded-xl text-red-500 font-black uppercase tracking-[0.2em] text-[10px] hover:bg-red-50 dark:hover:bg-red-500/5 transition-all active:scale-95 border border-transparent hover:border-red-500/20"
        >
          <span className="material-symbols-outlined text-sm">cancel</span>
          Terminate Process
        </button>
      </div>
    </div>
  );
};

export default ScanningView;
