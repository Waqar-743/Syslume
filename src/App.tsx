import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "./App.css";
import "./Syslume.css";
import { DEFAULT_SETTINGS, HISTORY_KEY, SETTINGS_KEY } from "./constants";
import type {
  AppSettings,
  AppView,
  DeleteResult,
  FinishedPayload,
  NodeId,
  ProgressPayload,
  RootEntry,
  ScanHandle,
  ScanHistoryEntry,
  ScanSummary,
  TreeNodeDelta,
  TreeNodeDeltaPayload,
} from "./types";
import HomeView from "./components/HomeView";
import ScanningView from "./components/ScanningView";
import DashboardView from "./components/DashboardView";
import SettingsView from "./components/SettingsView";
import SystemWorkspace, { Icon, MODULES } from "./components/SystemWorkspace";
import { useMonitor, type Module } from "./monitor";

export interface TreeNodeMap {
  [id: number]: TreeNodeDelta & { children: NodeId[] };
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const legacyKey = key === SETTINGS_KEY ? "disksight.settings.v2" : "disksight.history.v2";
    const stored = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored);
    if (Array.isArray(fallback)) {
      return (Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === "string" && typeof item.path === "string" && typeof item.name === "string" && Number.isFinite(item.scannedAt) && item.summary && Number.isFinite(item.summary.total_bytes) && Number.isFinite(item.summary.total_files) && Number.isFinite(item.summary.total_dirs)).slice(0,24) : fallback) as T;
    }
    if (!parsed || typeof parsed !== "object") return fallback;
    const defaults = fallback as Record<string, unknown>;
    const safe = { ...defaults };
    for (const [field, value] of Object.entries(defaults)) {
      const storedValue = parsed[field];
      if (Array.isArray(value)) safe[field] = Array.isArray(storedValue) ? storedValue.filter(item => typeof item === "string") : value;
      else if (typeof storedValue === typeof value && (typeof storedValue !== "number" || Number.isFinite(storedValue))) safe[field] = storedValue;
    }
    if (!["dark","light","system"].includes(String(safe.theme))) safe.theme = defaults.theme;
    return safe as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [module, setModule] = useState<Module>("overview");
  const monitoring = useMonitor(module === "processes");
  const [view, setView] = useState<AppView>("HOME");
  const [drives, setDrives] = useState<RootEntry[]>([]);
  const [target, setTarget] = useState<RootEntry | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => readJson(SETTINGS_KEY, DEFAULT_SETTINGS));
  const [history, setHistory] = useState<ScanHistoryEntry[]>(() => readJson(HISTORY_KEY, []));
  const [showSettings, setShowSettings] = useState(false);
  const [loadingDrives, setLoadingDrives] = useState(true);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [treeNodes, setTreeNodes] = useState<TreeNodeMap>({});
  const [rootNodeId, setRootNodeId] = useState<NodeId | null>(null);
  const [scanErrors, setScanErrors] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: "good" | "bad" | "neutral"; message: string } | null>(null);
  const activeScanRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const [scanClock, setScanClock] = useState(Date.now());
  const targetRef = useRef<RootEntry | null>(null);
  const listenersReady = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => { window.scrollTo(0, 0); }, [module, view]);

  const notify = useCallback((message: string, tone: "good" | "bad" | "neutral" = "neutral") => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (!monitoring.native) { setLoadingDrives(false); return; }
    invoke<RootEntry[]>("list_roots")
      .then(setDrives)
      .catch((error) => notify(`Could not read drives: ${error}`, "bad"))
      .finally(() => setLoadingDrives(false));
  }, [notify]);

  useEffect(() => {
    if (!monitoring.native) return;
    const unlisteners: UnlistenFn[] = [];
    let disposed = false;
    const register: typeof listen = async (...args) => {
      const unlisten = await listen(...args);
      if (disposed) unlisten(); else unlisteners.push(unlisten);
      return unlisten;
    };
    const belongsToActiveScan = (scanId: string) =>
      activeScanRef.current === "pending" || scanId === activeScanRef.current;

    const setup = async () => {
      await register<{ scan_id: string }>("scan://started", ({ payload }) => {
        if (activeScanRef.current === "pending") activeScanRef.current = payload.scan_id;
      });
      await register<ProgressPayload>("scan://progress", ({ payload }) => {
        if (belongsToActiveScan(payload.scan_id)) setProgress(payload);
      });
      await register<TreeNodeDeltaPayload>("scan://partial-tree", ({ payload }) => {
        if (!belongsToActiveScan(payload.scan_id)) return;
        setTreeNodes((previous) => {
          const next = { ...previous };
          for (const node of payload.nodes) {
            const existing = next[node.id];
            next[node.id] = { ...node, children: existing?.children ?? [] };
          }
          return next;
        });
      });
      await register<FinishedPayload>("scan://finished", ({ payload }) => {
        if (!belongsToActiveScan(payload.scan_id)) return;
        setSummary(payload.summary);
        setRootNodeId(payload.root_node_id);
        setView("DASHBOARD");
        activeScanRef.current = null;
        invoke<RootEntry[]>("list_roots").then(setDrives).catch(() => {});
        const currentTarget = targetRef.current;
        if (currentTarget) {
          const entry: ScanHistoryEntry = {
            id: payload.scan_id,
            path: currentTarget.path,
            name: currentTarget.name,
            scannedAt: Date.now(),
            durationMs: Date.now() - startedAtRef.current,
            summary: payload.summary,
          };
          setHistory((items) => [entry, ...items.filter((item) => item.id !== entry.id)].slice(0, 24));
        }
      });
      await register<{ scan_id: string; message: string; path?: string }>("scan://error", ({ payload }) => {
        if (!belongsToActiveScan(payload.scan_id)) return;
        setScanErrors((items) => [...items.slice(-49), payload.path || payload.message]);
      });
      await register<{ scan_id: string; message: string }>("scan://failed", ({ payload }) => {
        if (!belongsToActiveScan(payload.scan_id)) return;
        activeScanRef.current = null; setView("HOME");
        notify(`Scan failed: ${payload.message}`, "bad");
      });
      await register<{ scan_id: string }>("scan://canceled", ({ payload }) => {
        if (!belongsToActiveScan(payload.scan_id)) return;
        activeScanRef.current = null;
        setView("HOME");
        notify("Scan canceled");
      });
    };
    listenersReady.current = setup();
    void listenersReady.current.catch(error => notify(`Scan events unavailable: ${error}`, "bad"));
    return () => { disposed = true; unlisteners.forEach((unlisten) => unlisten()); };
  }, [notify]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const startScan = useCallback(async (nextTarget: RootEntry) => {
    if (activeScanRef.current) { notify("Cancel the current scan before starting another."); return; }
    try { await listenersReady.current; } catch { notify("Scan events could not be initialized. Restart Syslume.", "bad"); return; }
    targetRef.current = nextTarget;
    setTarget(nextTarget);
    setTreeNodes({});
    setSummary(null);
    setRootNodeId(null);
    setProgress(null);
    setScanErrors([]);
    setView("SCANNING");
    startedAtRef.current = Date.now();
    activeScanRef.current = "pending";
    try {
      const handle = await invoke<ScanHandle>("start_scan", {
        rootPath: nextTarget.path,
        options: {
          follow_symlinks: settings.followSymbolicLinks,
          one_file_system: settings.oneFileSystem,
          max_depth: settings.maxDepth,
          exclude_patterns: settings.excludePatterns,
          include_hidden: settings.includeHidden,
          include_system_dirs: settings.includeSystemDirs,
        },
      });
      // A small scan can finish before the IPC reply arrives.
      if (activeScanRef.current === "pending") activeScanRef.current = handle.scan_id;
    } catch (error) {
      activeScanRef.current = null;
      setView("HOME");
      notify(`Scan could not start: ${error}`, "bad");
    }
  }, [notify, settings]);

  const cancelScan = useCallback(async () => {
    if (!activeScanRef.current || activeScanRef.current === "pending") return;
    try { await invoke("cancel_scan", { scanId: activeScanRef.current }); }
    catch (e) { notify(`Cancellation failed: ${e}`, "bad"); }
  }, [notify]);

  const cleanPaths = useCallback(async (paths: string[]) => {
    const result = await invoke<DeleteResult>("bulk_smart_delete", { paths, force: true });
    if (result.files_deleted + result.folders_deleted > 0) notify(`Moved ${result.files_deleted + result.folders_deleted} items to the Recycle Bin`, "good");
    if (result.errors.length) notify(`${result.errors.length} items were skipped`, "bad");
    return result;
  }, [notify]);

  useEffect(() => {
    if(view !== "SCANNING") return;
    const timer = window.setInterval(() => setScanClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [view]);
  const elapsedMs = view === "SCANNING" ? Math.max(0, scanClock - startedAtRef.current) : 0;

  return (
    <div className="app-frame" spellCheck={false}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <button className="brand" onClick={() => setModule("overview")} aria-label="Syslume home">
          <img className="brand-mark" src="/syslume-mark.svg" alt="" aria-hidden="true" />
          <span><strong>Syslume</strong><small>system intelligence</small></span>
        </button>
        <div className="topbar-status">
          <span className={`status-dot ${view === "SCANNING" ? "is-live" : ""}`} />
          {view === "SCANNING" ? "Scanning filesystem" : "On-device intelligence"}
        </div>
        <div className="topbar-actions">
          <label className="refresh-control">Refresh<select aria-label="Monitoring refresh interval" value={monitoring.interval} onChange={e => monitoring.setInterval(Number(e.target.value))}><option value="2">2 seconds</option><option value="5">5 seconds</option><option value="10">10 seconds</option></select></label>
          <button className="text-button" onClick={() => monitoring.setPaused(!monitoring.paused)} aria-pressed={monitoring.paused}>{monitoring.paused ? "Resume" : "Pause"}</button>
          <button className="icon-button" onClick={() => setShowSettings(true)} aria-label="Open settings">⚙</button>
        </div>
      </header>

      <div className="application-body">
      <aside className="primary-sidebar"><span className="nav-caption">Your workspace</span><nav aria-label="System modules">{MODULES.map(item => <button key={item.id} onClick={() => setModule(item.id)} className={module === item.id ? "active" : ""} aria-current={module === item.id ? "page" : undefined}><Icon name={item.icon}/><span>{item.title}</span>{item.id === "storage" && view === "SCANNING" && <i className="nav-scan-dot"/>}</button>)}</nav><div className="sidebar-footer"><img src="/syslume-mark.svg" alt=""/><span>Read locally.<br/>Understand clearly.</span></div></aside>
      <main id="main-content" className="module-main">
        {module !== "storage" && <SystemWorkspace module={module} data={monitoring} drives={drives} onNavigate={setModule}/>}
        {module === "storage" && view === "HOME" && (
          <HomeView drives={drives} history={history} isLoading={loadingDrives} onSelectDrive={startScan} />
        )}
        {module === "storage" && view === "SCANNING" && (
          <ScanningView progress={progress} targetPath={target?.path || ""} elapsedMs={elapsedMs} warnings={scanErrors} onCancel={cancelScan} />
        )}
        {module === "storage" && view === "DASHBOARD" && summary && (
          <DashboardView
            summary={summary}
            treeNodes={treeNodes}
            rootNodeId={rootNodeId}
            rootPath={target?.path || ""}
            history={history}
            settings={settings}
            scanWarnings={scanErrors}
            onRescan={() => target && startScan(target)}
            onCleanPaths={cleanPaths}
            onNotify={notify}
            onNewScan={() => setView("HOME")}
          />
        )}
      </main>
      </div>

      {showSettings && (
        <SettingsView settings={settings} onUpdateSettings={(updates) => setSettings((value) => ({ ...value, ...updates }))} onClose={() => setShowSettings(false)} />
      )}
      {toast && <div className={`toast toast-${toast.tone}`} role="status"><span />{toast.message}<button aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button></div>}
    </div>
  );
}
