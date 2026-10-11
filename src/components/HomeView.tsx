import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@tauri-apps/api/core";
import { FORMAT_SIZE } from "../constants";
import type { RootEntry, ScanHistoryEntry } from "../types";

interface HomeViewProps {
  drives: RootEntry[];
  history: ScanHistoryEntry[];
  isLoading?: boolean;
  onSelectDrive: (drive: RootEntry) => void;
}

export default function HomeView({ drives, history, isLoading, onSelectDrive }: HomeViewProps) {
  const [pickingFolder, setPickingFolder] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const chooseFolder = async () => {
    setPickingFolder(true);
    setPickerError(null);
    try {
      const selected = await open({ directory: true, multiple: false, title: "Choose a folder to inspect" });
      if (typeof selected === "string") {
        const name = selected.split(/[\\/]/).filter(Boolean).pop() || selected;
        onSelectDrive({ name, path: selected, total_bytes: 0, available_bytes: 0 });
      }
    } catch (error) {
      setPickerError(`Could not open the folder picker: ${String(error)}`);
    } finally {
      setPickingFolder(false);
    }
  };

  return (
    <div className="home-shell">
      <section className="home-hero">
        <div className="hero-copy">
          <span className="eyebrow"><b>01</b> storage, made legible</span>
          <h1>See what your disk is <em>really</em> holding.</h1>
          <p>Map every heavy folder, surface old files and exact duplicates, then move reviewed clutter to trash from one focused workspace.</p>
          <div className="hero-actions">
            <button className="primary-action" onClick={chooseFolder} disabled={pickingFolder || !isTauri()}>
              <span>Choose a folder</span><b>{pickingFolder ? "…" : "↗"}</b>
            </button>
            {drives[0] && <button className="quiet-action" onClick={() => onSelectDrive(drives[0])}>Scan primary drive</button>}
          </div>
          {pickerError && <p role="alert">{pickerError}</p>}
          {!isTauri() && <p>Open the desktop app to read drives and choose folders.</p>}
        </div>
        <div className="hero-instrument" aria-label="Syslume capabilities">
          <div className="instrument-ring"><span>SCAN</span><strong>→</strong></div>
          <dl>
            <div><dt>Analysis</dt><dd>Size · age · type</dd></div>
            <div><dt>Verification</dt><dd>SHA-256 duplicates</dd></div>
            <div><dt>Cleanup</dt><dd>Review → trash</dd></div>
          </dl>
        </div>
      </section>

      <section className="drive-section">
        <div className="section-heading">
          <div><span className="eyebrow"><b>02</b> volumes</span><h2>Choose a drive</h2></div>
          <p>{isLoading ? "Reading attached volumes…" : `${drives.length} available volume${drives.length === 1 ? "" : "s"}`}</p>
        </div>
        <div className="drive-list">
          {isLoading && [0, 1].map((item) => <div className="drive-row skeleton" key={item} />)}
          {!isLoading && drives.map((drive, index) => {
            const used = Math.max(0, drive.total_bytes - drive.available_bytes);
            const percent = drive.total_bytes ? used / drive.total_bytes * 100 : 0;
            return (
              <button className="drive-row" key={drive.path} onClick={() => onSelectDrive(drive)}>
                <span className="drive-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="drive-identity"><strong>{drive.name || "Local volume"}</strong><small>{drive.path}</small></span>
                <span className="drive-meter"><i style={{ transform: `scaleX(${percent / 100})` }} /></span>
                <span className="drive-capacity"><strong>{FORMAT_SIZE(used)}</strong><small>{FORMAT_SIZE(drive.available_bytes)} free</small></span>
                <span className="row-arrow">↗</span>
              </button>
            );
          })}
          {!isLoading && drives.length === 0 && <div className="empty-panel">No mounted drives were reported. You can still choose a folder above.</div>}
        </div>
      </section>

      <section className="history-strip">
        <div className="section-heading compact"><div><span className="eyebrow"><b>03</b> recent</span><h2>Previous readings</h2></div></div>
        {history.length === 0 ? (
          <div className="history-empty"><strong>No history yet</strong><span>Your completed scans will appear here.</span></div>
        ) : (
          <div className="history-grid">
            {history.slice(0, 4).map((entry) => (
              <article key={entry.id}>
                <time>{new Date(entry.scannedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>
                <strong>{entry.name}</strong><span>{entry.path}</span>
                <footer><b>{FORMAT_SIZE(entry.summary.total_bytes)}</b><small>{entry.summary.total_files.toLocaleString()} files</small></footer>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
