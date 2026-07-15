import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "./App.css";
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

export interface TreeNodeMap {
  [id: number]: TreeNodeDelta & { children: NodeId[] };
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored);
    return Array.isArray(fallback) ? parsed as T : { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

export default function App() {
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
  const targetRef = useRef<RootEntry | null>(null);

  const notify = useCallback((message: string, tone: "good" | "bad" | "neutral" = "neutral") => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = settings.theme === "dark" || (settings.theme === "system" && prefersDark);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    invoke<RootEntry[]>("list_roots")
      .then(setDrives)
      .catch((error) => notify(`Could not read drives: ${error}`, "bad"))
      .finally(() => setLoadingDrives(false));
  }, [notify]);

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    const belongsToActiveScan = (scanId: string) =>
      activeScanRef.current === "pending" || scanId === activeScanRef.current;

    const setup = async () => {
      unlisteners.push(await listen<{ scan_id: string }>("scan://started", ({ payload }) => {
        if (activeScanRef.current === "pending") activeScanRef.current = payload.scan_id;
      }));
      unlisteners.push(await listen<ProgressPayload>("scan://progress", ({ payload }) => {
        if (belongsToActiveScan(payload.scan_id)) setProgress(payload);
      }));
      unlisteners.push(await listen<TreeNodeDeltaPayload>("scan://partial-tree", ({ payload }) => {
        if (!belongsToActiveScan(payload.scan_id)) return;
        setTreeNodes((previous) => {
          const next = { ...previous };
          for (const node of payload.nodes) {
            const existing = next[node.id];
            next[node.id] = { ...node, children: existing?.children ?? [] };
            if (node.parent !== null && next[node.parent]) {
              const parent = next[node.parent];
              if (!parent.children.includes(node.id)) {
                next[node.parent] = { ...parent, children: [...parent.children, node.id] };
              }
            }
          }
          return next;
        });
      }));
      unlisteners.push(await listen<FinishedPayload>("scan://finished", ({ payload }) => {
        if (!belongsToActiveScan(payload.scan_id)) return;
        setSummary(payload.summary);
        setRootNodeId(payload.root_node_id);
        setView("DASHBOARD");
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
      }));
      unlisteners.push(await listen<{ scan_id: string; message: string; path?: string }>("scan://error", ({ payload }) => {
        if (!belongsToActiveScan(payload.scan_id)) return;
        setScanErrors((items) => [...items.slice(-49), payload.path || payload.message]);
      }));
      unlisteners.push(await listen<{ scan_id: string }>("scan://canceled", ({ payload }) => {
        if (!belongsToActiveScan(payload.scan_id)) return;
        activeScanRef.current = null;
        setView("HOME");
        notify("Scan canceled");
      }));
    };
    void setup();
    return () => unlisteners.forEach((unlisten) => unlisten());
  }, [notify]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const startScan = useCallback(async (nextTarget: RootEntry) => {
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
      activeScanRef.current = handle.scan_id;
    } catch (error) {
      activeScanRef.current = null;
      setView("HOME");
      notify(`Scan could not start: ${error}`, "bad");
    }
  }, [notify, settings]);

  const cancelScan = useCallback(async () => {
    if (!activeScanRef.current || activeScanRef.current === "pending") return;
    await invoke("cancel_scan", { scanId: activeScanRef.current });
  }, []);

  const cleanPaths = useCallback(async (paths: string[]) => {
    const result = await invoke<DeleteResult>("bulk_smart_delete", { paths, force: true });
    if (result.bytes_freed > 0) notify(`Moved ${result.files_deleted + result.folders_deleted} items to trash`, "good");
    if (result.errors.length) notify(`${result.errors.length} items were skipped`, "bad");
    return result;
  }, [notify]);

  const elapsedMs = useMemo(() => view === "SCANNING" ? Date.now() - startedAtRef.current : 0, [progress, view]);

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <button className="brand" onClick={() => setView("HOME")} aria-label="DiskSight home">
          <img className="brand-mark" src="/disksight-mark.svg" alt="" aria-hidden="true" />
          <span><strong>DiskSight</strong><small>storage intelligence</small></span>
        </button>
        <div className="topbar-status">
          <span className={`status-dot ${view === "SCANNING" ? "is-live" : ""}`} />
          {view === "SCANNING" ? "Scanning filesystem" : target?.path || "Ready to inspect"}
        </div>
        <div className="topbar-actions">
          {view === "DASHBOARD" && <button className="text-button" onClick={() => setView("HOME")}>New scan</button>}
          <button className="icon-button" onClick={() => setShowSettings(true)} aria-label="Open settings">⚙</button>
        </div>
      </header>

      <main id="main-content">
        {view === "HOME" && (
          <HomeView drives={drives} history={history} isLoading={loadingDrives} onSelectDrive={startScan} />
        )}
        {view === "SCANNING" && (
          <ScanningView progress={progress} targetPath={target?.path || ""} elapsedMs={elapsedMs} warnings={scanErrors} onCancel={cancelScan} />
        )}
        {view === "DASHBOARD" && summary && (
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
          />
        )}
      </main>

      {showSettings && (
        <SettingsView settings={settings} onUpdateSettings={(updates) => setSettings((value) => ({ ...value, ...updates }))} onClose={() => setShowSettings(false)} />
      )}
      {toast && <div className={`toast toast-${toast.tone}`} role="status"><span />{toast.message}<button onClick={() => setToast(null)}>×</button></div>}
    </div>
  );
}
