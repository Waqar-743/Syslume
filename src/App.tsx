import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import "./App.css";
import type {
  RootEntry,
  ScanHandle,
  ScanOptions,
  ProgressPayload,
  FinishedPayload,
  ScanSummary,
  TreeNodeDelta,
  NodeId,
  AppView,
  AppSettings,
  ScanProgressPayload,
} from "./types";
import { DEFAULT_SETTINGS } from "./constants";

// Components
import Header from "./components/Header";
import HomeView from "./components/HomeView";
import ScanningView from "./components/ScanningView";
import DashboardView from "./components/DashboardView";
import FilteredResultsView from "./components/FilteredResultsView";
import SettingsView from "./components/SettingsView";

type ScanStatus = "idle" | "scanning" | "finished" | "error" | "canceled";

interface TreeNodeMap {
  [id: number]: TreeNodeDelta & { children: NodeId[] };
}

function App() {
  // App state
  const [currentView, setCurrentView] = useState<AppView>("HOME");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [filterExtension, setFilterExtension] = useState<string | null>(null);

  // Scan state
  const [drives, setDrives] = useState<RootEntry[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<RootEntry | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [rootNodeId, setRootNodeId] = useState<NodeId | null>(null);
  const [treeNodes, setTreeNodes] = useState<TreeNodeMap>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanErrors, setScanErrors] = useState<string[]>([]);
  const [loadingDrives, setLoadingDrives] = useState(true);

  // Theme management
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const isDark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
      html.classList.add('dark');
      body.classList.add('dark');
    } else {
      html.classList.remove('dark');
      body.classList.remove('dark');
    }

    body.dataset.theme = isDark ? 'dark' : 'light';
    if (root) root.dataset.theme = isDark ? 'dark' : 'light';
  }, [settings.theme]);

  // Load drives on mount
  useEffect(() => {
    loadDrives();
  }, []);

  // Set up event listeners
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    const setupListeners = async () => {
      unlisteners.push(
        await listen<ProgressPayload>("scan://progress", (event) => {
          setProgress(event.payload);
        })
      );

      unlisteners.push(
        await listen<{ nodes: TreeNodeDelta[] }>("scan://partial-tree", (event) => {
          setTreeNodes((prev) => {
            const updated = { ...prev };
            for (const node of event.payload.nodes) {
              const existing = updated[node.id];
              updated[node.id] = {
                ...node,
                children: existing?.children || [],
              };
              // Update parent's children
              if (node.parent !== null && updated[node.parent]) {
                const parent = updated[node.parent];
                if (!parent.children.includes(node.id)) {
                  updated[node.parent] = {
                    ...parent,
                    children: [...parent.children, node.id],
                  };
                }
              }
            }
            return updated;
          });
        })
      );

      unlisteners.push(
        await listen<FinishedPayload>("scan://finished", (event) => {
          setScanStatus("finished");
          setSummary(event.payload.summary);
          setRootNodeId(event.payload.root_node_id);
          setCurrentView("DASHBOARD");
        })
      );

      unlisteners.push(
        await listen<{ message: string; path?: string }>("scan://error", (event) => {
          // Track non-fatal errors (permission denied, access errors) without stopping scan
          const msg = event.payload.message;
          const isPermissionError = msg.includes('Access is denied') || 
                                   msg.includes('Permission denied') ||
                                   msg.includes('IO error') ||
                                   msg.includes('os error 5');
          
          if (isPermissionError) {
            // Just log permission errors, don't stop the scan
            setScanErrors(prev => [...prev.slice(-19), event.payload.path || msg]);
          } else {
            // Fatal error - stop scanning
            setErrorMessage(msg);
            setScanStatus("error");
            setCurrentView("HOME");
          }
        })
      );

      unlisteners.push(
        await listen("scan://canceled", () => {
          setScanStatus("canceled");
          setCurrentView("HOME");
        })
      );
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const loadDrives = async () => {
    setLoadingDrives(true);
    try {
      const roots = await invoke<RootEntry[]>("list_roots");
      setDrives(roots);
      if (roots.length > 0 && !selectedDrive) {
        setSelectedDrive(roots[0]);
      }
    } catch (err) {
      console.error("Failed to load drives:", err);
    } finally {
      setLoadingDrives(false);
    }
  };

  const startScan = async (drive: RootEntry) => {
    setSelectedDrive(drive);
    
    // Reset state
    setScanStatus("scanning");
    setProgress(null);
    setSummary(null);
    setTreeNodes({});
    setErrorMessage(null);
    setScanErrors([]);
    setRootNodeId(null);
    setCurrentView("SCANNING");

    const options: ScanOptions = {
      follow_symlinks: false,
      one_file_system: false,
      max_depth: settings.maxDepth,
      exclude_patterns: [],
    };

    try {
      const handle = await invoke<ScanHandle>("start_scan", {
        rootPath: drive.path,
        options,
      });
      setCurrentScanId(handle.scan_id);
    } catch (err) {
      setScanStatus("error");
      setErrorMessage(String(err));
      setCurrentView("HOME");
    }
  };

  const cancelScan = async () => {
    if (!currentScanId) return;
    try {
      await invoke("cancel_scan", { scanId: currentScanId });
    } catch (err) {
      console.error("Failed to cancel scan:", err);
    }
  };

  const handleExtensionClick = (ext: string) => {
    setFilterExtension(ext);
    setCurrentView("FILTERED");
  };

  const handleClearFilter = () => {
    setFilterExtension(null);
    setCurrentView("DASHBOARD");
  };

  const handleNewScan = () => {
    setCurrentView("HOME");
    setScanStatus("idle");
  };

  const handleUpdateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  // Transform progress data for ScanningView
  const scanProgress: ScanProgressPayload = useMemo(() => ({
    phase: progress?.phase || "INIT",
    visited_entries: progress?.visited_entries || 0,
    visited_bytes_approx: progress?.visited_bytes_approx || 0,
    current_path: progress?.current_path || "",
    elapsed_ms: Date.now() - (progress ? Date.now() : 0),
  }), [progress]);

  // Render current view
  const renderView = () => {
    switch (currentView) {
      case "HOME":
        return (
          <HomeView
            drives={drives}
            onSelectDrive={startScan}
            isLoading={loadingDrives}
          />
        );
      case "SCANNING":
        return (
          <ScanningView
            progress={scanProgress}
            onCancel={cancelScan}
            targetPath={selectedDrive?.path || ""}
            rootPath={selectedDrive?.path}
            scanErrors={scanErrors}
            totalDriveBytes={selectedDrive?.total_bytes}
          />
        );
      case "DASHBOARD":
        return (
          <DashboardView
            summary={summary}
            treeNodes={treeNodes}
            rootNodeId={rootNodeId}
            rootPath={selectedDrive?.path}
            onExtensionClick={handleExtensionClick}
            onNewScan={handleNewScan}
            onRescan={() => selectedDrive && startScan(selectedDrive)}
          />
        );
      case "FILTERED":
        return (
          <FilteredResultsView
            extension={filterExtension || ""}
            onClearFilter={handleClearFilter}
            treeNodes={treeNodes}
            summary={summary}
            onRescan={() => selectedDrive && startScan(selectedDrive)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="app app-shell min-h-screen flex flex-col transition-colors">
      <Header
        currentView={currentView}
        onNavigate={setCurrentView}
        onOpenSettings={() => setShowSettings(true)}
        scanActive={scanStatus === "scanning"}
        theme={settings.theme}
      />
      
      {renderView()}

      {showSettings && (
        <SettingsView
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Error Toast */}
      {errorMessage && (
        <div className="fixed bottom-6 right-6 bg-red-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-slideIn">
          <span className="material-symbols-outlined">error</span>
          <span className="font-medium">{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="ml-4 hover:bg-white/20 rounded-lg p-1 transition-colors">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
