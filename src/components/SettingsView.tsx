import { useRef, useState } from "react";
import { useDialog } from "../useDialog";
import type { AppSettings } from "../types";

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onClose: () => void;
}

function Toggle({ checked, onChange, label, detail }: { checked: boolean; onChange: () => void; label: string; detail: string }) {
  return <button className="setting-toggle" onClick={onChange} role="switch" aria-checked={checked}>
    <span><strong>{label}</strong><small>{detail}</small></span><i className={checked ? "on" : ""}><b /></i>
  </button>;
}

export default function SettingsView({ settings, onUpdateSettings, onClose }: SettingsViewProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialog(dialogRef, true, onClose);
  const [excludeText, setExcludeText] = useState(settings.excludePatterns.join("\n"));
  const saveExclusions = () => onUpdateSettings({ excludePatterns: excludeText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean) });

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside ref={dialogRef} className="settings-drawer" role="dialog" aria-modal="true" aria-label="Settings">
        <header><div><span className="eyebrow"><b>Preferences</b></span><h2>Scan settings</h2></div><button className="icon-button" aria-label="Close settings" onClick={onClose}>×</button></header>
        <div className="settings-content">
          <section>
            <h3>Appearance</h3>
            <div className="segmented-control">
              {(["system", "light", "dark"] as const).map((theme) => <button className={settings.theme === theme ? "active" : ""} key={theme} onClick={() => onUpdateSettings({ theme })}>{theme}</button>)}
            </div>
          </section>
          <section>
            <h3>Traversal</h3>
            <label className="range-setting"><span><strong>Maximum depth</strong><b>{settings.maxDepth}</b></span><input type="range" min="4" max="96" value={settings.maxDepth} onChange={(event) => onUpdateSettings({ maxDepth: Number(event.target.value) })} /></label>
            <Toggle checked={settings.includeHidden} onChange={() => onUpdateSettings({ includeHidden: !settings.includeHidden })} label="Include hidden items" detail="Read dotfiles and hidden filesystem entries" />
            <Toggle checked={settings.includeSystemDirs} onChange={() => onUpdateSettings({ includeSystemDirs: !settings.includeSystemDirs })} label="Include system and build folders" detail="Slower and may produce access warnings" />
            <Toggle checked={settings.oneFileSystem} onChange={() => onUpdateSettings({ oneFileSystem: !settings.oneFileSystem })} label="Stay on selected filesystem" detail="Avoid crossing mounted volumes" />
            <Toggle checked={settings.followSymbolicLinks} onChange={() => onUpdateSettings({ followSymbolicLinks: !settings.followSymbolicLinks })} label="Follow symbolic links" detail="Use carefully; links may create large traversals" />
          </section>
          <section>
            <h3>Analysis thresholds</h3>
            <label className="number-setting"><span><strong>Duplicate minimum</strong><small>Ignore smaller files during hashing</small></span><input type="number" min="1" max="10240" value={settings.duplicateMinSizeMb} onChange={(event) => onUpdateSettings({ duplicateMinSizeMb: Math.max(1, Number(event.target.value)) })} /><b>MB</b></label>
            <label className="number-setting"><span><strong>Old file age</strong><small>Used by the stale-files insight</small></span><input type="number" min="30" max="3650" value={settings.oldFileDays} onChange={(event) => onUpdateSettings({ oldFileDays: Math.max(30, Number(event.target.value)) })} /><b>days</b></label>
          </section>
          <section>
            <h3>Exclusions</h3>
            <p className="setting-help">One path fragment per line. Matching folders are skipped.</p>
            <textarea value={excludeText} onChange={(event) => setExcludeText(event.target.value)} onBlur={saveExclusions} placeholder="vendor&#10;.snapshots&#10;archive" />
          </section>
        </div>
        <footer><button className="primary-action" onClick={() => { saveExclusions(); onClose(); }}><span>Save settings</span><b>✓</b></button></footer>
      </aside>
    </div>
  );
}
