import React from 'react';
import type { AppSettings } from '../types';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onClose: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ settings, onUpdateSettings, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="app-surface w-full max-w-lg rounded-3xl shadow-2xl border overflow-hidden animate-slideIn">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Settings</h2>
          <button onClick={onClose} className="app-surface-muted w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-5 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-secondary">palette</span>
              Interface Theme
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {(['system', 'light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => onUpdateSettings({ theme: t })}
                  className={`app-surface p-4 rounded-2xl border-2 transition-all ${settings.theme === t ? 'border-secondary bg-secondary/5' : 'border-slate-200 dark:border-slate-800 hover:border-secondary/50'}`}
                >
                  <span className={`material-symbols-outlined text-2xl block mx-auto mb-2 ${settings.theme === t ? 'text-secondary' : 'text-slate-400'}`}>
                    {t === 'system' ? 'settings_suggest' : t === 'light' ? 'light_mode' : 'dark_mode'}
                  </span>
                  <span className={`text-xs font-bold capitalize ${settings.theme === t ? 'text-secondary' : 'text-slate-500'}`}>{t}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-5 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-secondary">scanner</span>
              Scan Limits
            </h3>
            <div className="space-y-5">
              <div>
                <label className="flex items-center justify-between text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
                  Scan threads
                  <span className="text-xs font-mono text-secondary">{settings.scanThreads} threads</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="16"
                  value={settings.scanThreads}
                  onChange={(e) => onUpdateSettings({ scanThreads: parseInt(e.target.value) })}
                  className="w-full accent-secondary"
                />
              </div>
              <div>
                <label className="flex items-center justify-between text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
                  Max depth
                  <span className="text-xs font-mono text-secondary">{settings.maxDepth} levels</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={settings.maxDepth}
                  onChange={(e) => onUpdateSettings({ maxDepth: parseInt(e.target.value) })}
                  className="w-full accent-secondary"
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-5 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-secondary">filter_alt</span>
              Scan Options
            </h3>
            <div className="space-y-3">
              {[
                { key: 'includeHidden' as const, label: 'Include hidden items', desc: 'Files starting with a dot' },
                { key: 'includeSystemDirs' as const, label: 'Include system directories', desc: 'Windows, node_modules, etc.' },
              ].map(({ key, label, desc }) => (
                <div
                  key={key}
                  onClick={() => onUpdateSettings({ [key]: !settings[key] })}
                  className="app-surface-muted flex items-center justify-between p-4 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div>
                    <span className="font-bold text-sm text-slate-700 dark:text-white">{label}</span>
                    <p className="text-xs text-slate-400 dark:text-slate-300 mt-0.5">{desc}</p>
                  </div>
                  <div className={`w-12 h-7 rounded-full p-1 transition-colors ${settings[key] ? 'bg-secondary' : 'bg-slate-300 dark:bg-slate-700'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${settings[key] ? 'translate-x-5' : ''}`} />
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>

        <div className="app-surface-muted p-6 border-t">
          <button onClick={onClose} className="w-full h-12 rounded-xl bg-secondary text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-secondary/30 hover:brightness-110 transition-all">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
