import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FORMAT_SIZE } from "../constants";
import type { TreeNodeMap } from "../App";
import type { AppSettings, DeleteResult, DuplicateGroup, NodeId, ScanHistoryEntry, ScanSummary, TreeNodeDelta } from "../types";
import StorageTreemap from "./StorageTreemap";
import { useDialog } from "../useDialog";

interface DashboardViewProps {
  summary: ScanSummary;
  treeNodes: TreeNodeMap;
  rootNodeId: NodeId | null;
  rootPath: string;
  history: ScanHistoryEntry[];
  settings: AppSettings;
  scanWarnings: string[];
  onRescan: () => void;
  onNewScan: () => void;
  onCleanPaths: (paths: string[]) => Promise<DeleteResult>;
  onNotify: (message: string, tone?: "good" | "bad" | "neutral") => void;
}

type WorkspaceTab = "overview" | "explorer" | "cleanup" | "duplicates" | "history";
type IndexedNode = TreeNodeDelta & { children: NodeId[] };

const CATEGORY_EXTENSIONS: Record<string, string[]> = {
  Video: ["mp4", "mkv", "avi", "mov", "webm", "wmv"],
  Images: ["jpg", "jpeg", "png", "gif", "webp", "svg", "raw", "tiff"],
  Audio: ["mp3", "wav", "flac", "aac", "ogg", "m4a"],
  Documents: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"],
  Archives: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"],
  Code: ["js", "ts", "tsx", "jsx", "py", "rs", "go", "java", "cpp", "c", "css", "html"],
};

function categoryFor(extension: string | null) {
  const ext = (extension || "").toLowerCase();
  return Object.entries(CATEGORY_EXTENSIONS).find(([, values]) => values.includes(ext))?.[0] || "Other";
}

function cleanupReason(node: IndexedNode): { reason: string; risk: "low" | "review" } | null {
  if (node.kind !== "file") return null;
  const path = node.path.toLowerCase();
  const ext = (node.file_ext || "").toLowerCase();
  const name = node.name.toLowerCase();
  if (["tmp", "temp", "dmp", "swp", "swo"].includes(ext)) return { reason: "Temporary file", risk: "low" };
  if (["bak", "old"].includes(ext)) return { reason: "Backup residue", risk: "review" };
  if (ext === "log" && node.size_bytes >= 1024 * 1024) return { reason: "Large log file", risk: "review" };
  if (name === "thumbs.db" || name === ".ds_store") return { reason: "Generated metadata", risk: "low" };
  if (/(^|[\\/])(cache|\.cache|temp|tmp|__pycache__)([\\/]|$)/.test(path)) return { reason: "Cache or temporary data", risk: "review" };
  return null;
}

function formatDate(timestamp?: number | null) {
  return timestamp ? new Date(timestamp * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Unknown";
}

function downloadFile(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function DashboardView(props: DashboardViewProps) {
  const { summary, treeNodes, rootNodeId, rootPath, history, settings, scanWarnings, onRescan, onCleanPaths, onNotify } = props;
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "file" | "dir" | "old">("all");
  const [selectedNode, setSelectedNode] = useState<IndexedNode | null>(null);
  const [cleanupSelection, setCleanupSelection] = useState<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[] | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const reviewRef = useRef<HTMLElement>(null);
  const closeReview = useCallback(() => { if (!cleaning) setReviewOpen(false); }, [cleaning]);
  useDialog(reviewRef, reviewOpen, closeReview);

  const nodes = useMemo(() => Object.values(treeNodes), [treeNodes]);
  const files = useMemo(() => nodes.filter((node) => node.kind === "file"), [nodes]);
  const directories = useMemo(() => nodes.filter((node) => node.kind === "dir"), [nodes]);
  const largestFiles = useMemo(() => [...files].sort((a, b) => b.size_bytes - a.size_bytes).slice(0, 12), [files]);
  const largestDirectories = useMemo(() => [...directories].filter((node) => node.id !== rootNodeId).sort((a, b) => b.size_bytes - a.size_bytes).slice(0, 9), [directories, rootNodeId]);
  const oldestCutoff = Math.floor(Date.now() / 1000) - settings.oldFileDays * 86400;
  const oldFiles = useMemo(() => files.filter((node) => node.modified_unix && node.modified_unix < oldestCutoff).sort((a, b) => b.size_bytes - a.size_bytes), [files, oldestCutoff]);
  const cleanupCandidates = useMemo(() => files.map((node) => ({ node, insight: cleanupReason(node) })).filter((value): value is { node: IndexedNode; insight: { reason: string; risk: "low" | "review" } } => Boolean(value.insight)).sort((a, b) => b.node.size_bytes - a.node.size_bytes), [files]);
  const reclaimable = cleanupCandidates.reduce((sum, item) => sum + item.node.size_bytes, 0);

  const categoryStats = useMemo(() => {
    const stats = new Map<string, { bytes: number; count: number }>();
    files.forEach((file) => {
      const key = categoryFor(file.file_ext);
      const value = stats.get(key) || { bytes: 0, count: 0 };
      value.bytes += file.size_bytes; value.count += 1; stats.set(key, value);
    });
    return [...stats.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.bytes - a.bytes);
  }, [files]);

  const filteredNodes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return nodes.filter((node) => {
      if (kindFilter === "file" && node.kind !== "file") return false;
      if (kindFilter === "dir" && node.kind !== "dir") return false;
      if (kindFilter === "old" && !(node.kind === "file" && node.modified_unix && node.modified_unix < oldestCutoff)) return false;
      return !normalized || node.name.toLowerCase().includes(normalized) || node.path.toLowerCase().includes(normalized);
    }).sort((a, b) => b.size_bytes - a.size_bytes).slice(0, 1000);
  }, [nodes, query, kindFilter, oldestCutoff]);

  const selectedCleanupNodes = useMemo(() => {
    const candidates = new Map(files.map(n => [n.path, n]));
    for (const group of duplicates || []) for (const file of group.files) {
      if (!candidates.has(file.path)) candidates.set(file.path, {
        id: -candidates.size-1, parent: null, kind: "file", children: [],
        path: file.path, name: file.path.split(/[\\/]/).pop() || file.path,
        size_bytes: file.size_bytes, file_ext: null,
      });
    }
    return [...cleanupSelection].map(path => candidates.get(path)).filter((node): node is IndexedNode => Boolean(node));
  }, [cleanupSelection, files, duplicates]);
  const selectionBytes = selectedCleanupNodes.reduce((sum, node) => sum + node.size_bytes, 0);

  const toggleCleanup = (path: string) => setCleanupSelection((current) => {
    const next = new Set(current); next.has(path) ? next.delete(path) : next.add(path); return next;
  });

  const runCleanup = async () => {
    if (selectedCleanupNodes.length !== cleanupSelection.size) { onNotify("Some selected items could not be resolved. Rebuild the selection before cleanup.", "bad"); return; }
    setCleaning(true);
    try {
      const result = await onCleanPaths([...cleanupSelection]);
      if (result.files_deleted + result.folders_deleted > 0) {
        setCleanupSelection(new Set()); setReviewOpen(false); onRescan();
      }
    } catch (error) { onNotify(`Cleanup failed: ${error}`, "bad"); }
    finally { setCleaning(false); }
  };

  const findDuplicates = async () => {
    setDuplicateLoading(true);
    try {
      const result = await invoke<DuplicateGroup[]>("find_duplicates", { rootPath, minSizeBytes: settings.duplicateMinSizeMb * 1024 * 1024 });
      setDuplicates(result);
      if (!result.length) onNotify("No exact duplicates found above the selected threshold", "good");
    } catch (error) { onNotify(`Duplicate scan failed: ${error}`, "bad"); }
    finally { setDuplicateLoading(false); }
  };

  const addDuplicateCopies = (group: DuplicateGroup) => setCleanupSelection((current) => {
    const next = new Set(current); group.files.slice(1).forEach((file) => next.add(file.path)); return next;
  });

  const exportJson = () => downloadFile("syslume-report.json", "application/json", JSON.stringify({ rootPath, scannedAt: new Date().toISOString(), summary, nodes }, null, 2));
  const exportCsv = () => {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = ["name,path,kind,size_bytes,extension,modified", ...nodes.map((node) => [escape(node.name), escape(node.path), node.kind, node.size_bytes, node.file_ext || "", node.modified_unix || ""].join(","))];
    downloadFile("syslume-report.csv", "text/csv", rows.join("\r\n"));
  };

  return (
    <div className="workspace-shell">
      <aside className="workspace-nav">
        <div className="volume-stamp"><span>Current reading</span><strong>{rootPath}</strong><small>{new Date().toLocaleDateString()}</small></div>
        <nav aria-label="Analysis sections">
          {(["overview", "explorer", "cleanup", "duplicates", "history"] as WorkspaceTab[]).map((item, index) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}><span>{String(index + 1).padStart(2, "0")}</span>{item}{item === "cleanup" && cleanupCandidates.length > 0 && <b>{cleanupCandidates.length}</b>}</button>
          ))}
        </nav>
        <div className="nav-actions"><button onClick={props.onNewScan}>Choose another location</button><button onClick={exportCsv}>Export CSV</button><button onClick={exportJson}>Export JSON</button><button onClick={onRescan}>Rescan</button></div>
        <div className="safety-note"><i>✓</i><span><strong>Trash-only cleanup</strong>Syslume will not silently delete permanently.</span></div>
      </aside>

      <section className="workspace-content">
        {tab === "overview" && <>
          <header className="workspace-heading"><div><span className="eyebrow"><b>Overview</b> completed reading</span><h1>Your storage,<br /><em>in proportion.</em></h1></div><p>{scanWarnings.length ? `${scanWarnings.length} paths could not be read. Totals reflect accessible data.` : "All reported paths were read successfully."}</p></header>
          <div className="metric-rail">
            <article><span>Mapped data</span><strong>{FORMAT_SIZE(summary.total_bytes)}</strong><small>{rootPath}</small></article>
            <article><span>Files indexed</span><strong>{summary.total_files.toLocaleString()}</strong><small>across {summary.total_dirs.toLocaleString()} folders</small></article>
            <article><span>Review candidates</span><strong>{FORMAT_SIZE(reclaimable)}</strong><small>{cleanupCandidates.length} explainable suggestions</small></article>
            <article><span>Older than {settings.oldFileDays}d</span><strong>{FORMAT_SIZE(oldFiles.reduce((sum, file) => sum + file.size_bytes, 0))}</strong><small>{oldFiles.length.toLocaleString()} files</small></article>
          </div>
          <StorageTreemap nodes={treeNodes} root={rootNodeId} onInspect={id => { setSelectedNode(treeNodes[id]); setTab("explorer"); }}/>
          <div className="overview-grid">
            <section className="space-map panel"><div className="panel-heading"><div><span>Largest folders</span><h2>Where space gathers</h2></div><button onClick={() => setTab("explorer")}>Open explorer ↗</button></div>
              <div className="space-map-list">{largestDirectories.map((directory, index) => <button key={directory.id} onClick={() => { setSelectedNode(directory); setTab("explorer"); }}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{directory.name}</strong><small>{directory.path}</small></div><i><b style={{ transform: `scaleX(${summary.total_bytes ? directory.size_bytes / summary.total_bytes : 0})` }} /></i><em>{FORMAT_SIZE(directory.size_bytes)}</em></button>)}</div>
            </section>
            <section className="category-panel panel"><div className="panel-heading"><div><span>File families</span><h2>Content mix</h2></div></div>
              <div className="category-stack">{categoryStats.map((category, index) => <article key={category.name}><span className={`category-swatch swatch-${index % 6}`} /><div><strong>{category.name}</strong><small>{category.count.toLocaleString()} files</small></div><b>{FORMAT_SIZE(category.bytes)}</b><i><em style={{ transform: `scaleX(${summary.total_bytes ? category.bytes / summary.total_bytes : 0})` }} /></i></article>)}</div>
            </section>
          </div>
          <section className="largest-list panel"><div className="panel-heading"><div><span>Heavy objects</span><h2>Largest individual files</h2></div></div><DataTable nodes={largestFiles} selected={selectedNode} onSelect={setSelectedNode} onOpen={(path) => invoke("open_in_explorer", { path })} onQueue={(path) => { setCleanupSelection((current) => new Set(current).add(path)); onNotify("Added to cleanup review"); }} /></section>
        </>}

        {tab === "explorer" && <>
          <header className="workspace-heading compact-heading"><div><span className="eyebrow"><b>Explorer</b> indexed objects</span><h1>Search the reading.</h1></div><p>Results are sorted by size. The first 1,000 matches are shown to keep navigation responsive.</p></header>
          <div className="explorer-tools"><label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or path" /></label><div className="segmented-control">{(["all", "file", "dir", "old"] as const).map((kind) => <button className={kindFilter === kind ? "active" : ""} key={kind} onClick={() => setKindFilter(kind)}>{kind}</button>)}</div><span>{filteredNodes.length.toLocaleString()} shown</span></div>
          <section className="explorer-layout"><div className="panel explorer-table"><DataTable nodes={filteredNodes} selected={selectedNode} onSelect={setSelectedNode} onOpen={(path) => invoke("open_in_explorer", { path })} onQueue={(path) => setCleanupSelection((current) => new Set(current).add(path))} /></div><DetailPanel node={selectedNode} onOpen={(path) => invoke("open_in_explorer", { path })} onQueue={(path) => { setCleanupSelection((current) => new Set(current).add(path)); onNotify("Added to cleanup review"); }} /></section>
        </>}

        {tab === "cleanup" && <>
          <header className="workspace-heading compact-heading"><div><span className="eyebrow"><b>Cleanup</b> explainable suggestions</span><h1>Review before reclaiming.</h1></div><p>Suggestions are never executed automatically. Select only the items you recognize.</p></header>
          <div className="cleanup-summary"><div><span>Potential space</span><strong>{FORMAT_SIZE(reclaimable)}</strong><small>{cleanupCandidates.length} candidate files</small></div><div><span>Selected</span><strong>{FORMAT_SIZE(selectionBytes)}</strong><small>{cleanupSelection.size} items</small></div><button className="primary-action" disabled={!cleanupSelection.size} onClick={() => setReviewOpen(true)}><span>Review selection</span><b>→</b></button></div>
          <section className="candidate-list panel">{cleanupCandidates.length === 0 ? <EmptyState title="Nothing obvious to clean" detail="Syslume did not find temporary, cache, backup, or large log files in this reading." /> : cleanupCandidates.map(({ node, insight }) => <label className="candidate-row" key={node.id}><input type="checkbox" checked={cleanupSelection.has(node.path)} onChange={() => toggleCleanup(node.path)} /><i /><span className={`risk-tag risk-${insight.risk}`}>{insight.risk === "low" ? "lower risk" : "review"}</span><div><strong>{node.name}</strong><small>{node.path}</small></div><em>{insight.reason}</em><b>{FORMAT_SIZE(node.size_bytes)}</b></label>)}</section>
        </>}

        {tab === "duplicates" && <>
          <header className="workspace-heading compact-heading"><div><span className="eyebrow"><b>Duplicates</b> byte-level verification</span><h1>Find exact copies.</h1></div><p>Syslume groups files by size, then verifies matching candidates with SHA-256. The original file is never selected automatically.</p></header>
          <div className="duplicate-command"><div><span>Minimum file size</span><strong>{settings.duplicateMinSizeMb} MB</strong><small>Change this threshold in settings</small></div><button className="primary-action" onClick={findDuplicates} disabled={duplicateLoading}><span>{duplicateLoading ? "Hashing candidates…" : duplicates ? "Run again" : "Find duplicates"}</span><b>{duplicateLoading ? "…" : "⌁"}</b></button></div>
          {duplicates === null ? <EmptyState title="Duplicate analysis is on demand" detail="Hashing reads candidate files from disk, so it runs separately from the fast size scan." /> : duplicates.length === 0 ? <EmptyState title="No exact duplicates found" detail="Try lowering the minimum size threshold if you want a broader search." /> : <div className="duplicate-groups">{duplicates.map((group, index) => <article className="panel" key={group.hash}><header><span>Set {String(index + 1).padStart(2, "0")}</span><strong>{group.files.length} exact copies</strong><b>{FORMAT_SIZE(group.reclaimable_bytes)} reclaimable</b><button onClick={() => { addDuplicateCopies(group); onNotify("Duplicate copies added to cleanup review"); }}>Review extra copies</button></header>{group.files.map((file, fileIndex) => <div className="duplicate-file" key={file.path}><i>{fileIndex === 0 ? "KEEP" : "COPY"}</i><span>{file.path}</span><b>{FORMAT_SIZE(file.size_bytes)}</b></div>)}</article>)}</div>}
        </>}

        {tab === "history" && <>
          <header className="workspace-heading compact-heading"><div><span className="eyebrow"><b>History</b> local snapshots</span><h1>Watch storage change.</h1></div><p>Completed scan summaries are stored on this device. They contain totals and paths, not file contents.</p></header>
          <section className="history-table panel"><div className="history-table-head"><span>Date</span><span>Location</span><span>Mapped</span><span>Files</span><span>Duration</span></div>{history.map((entry, index) => { const previous = history[index + 1]; const delta = previous && previous.path === entry.path ? entry.summary.total_bytes - previous.summary.total_bytes : null; return <article key={entry.id}><time>{new Date(entry.scannedAt).toLocaleString()}</time><div><strong>{entry.name}</strong><small>{entry.path}</small></div><span><b>{FORMAT_SIZE(entry.summary.total_bytes)}</b>{delta !== null && <small className={delta > 0 ? "delta-up" : "delta-down"}>{delta > 0 ? "+" : ""}{FORMAT_SIZE(Math.abs(delta))}</small>}</span><span>{entry.summary.total_files.toLocaleString()}</span><span>{Math.round(entry.durationMs / 1000)}s</span></article>})}</section>
        </>}
      </section>

      {cleanupSelection.size > 0 && !reviewOpen && <button className="floating-review" onClick={() => setReviewOpen(true)}><span>{cleanupSelection.size}</span><strong>Review cleanup</strong><b>{FORMAT_SIZE(selectionBytes)} →</b></button>}
      {reviewOpen && <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeReview()}><aside ref={reviewRef} className="review-drawer" role="dialog" aria-modal="true" aria-label="Review cleanup selection"><header><div><span className="eyebrow"><b>Final review</b></span><h2>Move to Recycle Bin</h2></div><button className="icon-button" aria-label="Close cleanup review" disabled={cleaning} onClick={closeReview}>×</button></header><div className="review-total"><span>Selected size</span><strong>{FORMAT_SIZE(selectionBytes)}</strong><small>{selectedCleanupNodes.length} items will be sent to the Recycle Bin. Space is released when you empty it.</small></div><div className="review-list">{selectedCleanupNodes.map((node) => <article key={node.path}><div><strong>{node.name}</strong><small>{node.path}</small></div><b>{FORMAT_SIZE(node.size_bytes)}</b><button onClick={() => toggleCleanup(node.path)}>Remove</button></article>)}</div><footer><p>Syslume blocks protected system paths in the Rust backend. Trash availability still depends on your operating system and volume.</p><button className="danger-action" onClick={runCleanup} disabled={cleaning}>{cleaning ? "Moving items…" : "Confirm and move to Recycle Bin"}</button></footer></aside></div>}
    </div>
  );
}

function DataTable({ nodes, selected, onSelect, onOpen, onQueue }: { nodes: IndexedNode[]; selected: IndexedNode | null; onSelect: (node: IndexedNode) => void; onOpen: (path: string) => void; onQueue: (path: string) => void }) {
  return <div className="data-table"><div className="data-table-head"><span>Name</span><span>Modified</span><span>Type</span><span>Size</span><span /></div>{nodes.map((node) => <div className={`data-row ${selected?.id === node.id ? "selected" : ""}`} key={node.id} onClick={() => onSelect(node)} onDoubleClick={() => onOpen(node.path)}><i className={`file-glyph ${node.kind}`}>{node.kind === "dir" ? "▰" : "▪"}</i><button className="file-name" aria-label={`Select ${node.name}`} onClick={() => onSelect(node)}><strong>{node.name}</strong><small>{node.path}</small></button><span>{formatDate(node.modified_unix)}</span><span>{node.kind === "dir" ? "Folder" : (node.file_ext || "File").toUpperCase()}</span><b>{FORMAT_SIZE(node.size_bytes)}</b><span className="row-actions"><button aria-label={`Open ${node.name}`} onClick={(event) => { event.stopPropagation(); onOpen(node.path); }}>Open</button>{node.kind === "file" && <button aria-label={`Review ${node.name} for cleanup`} onClick={(event) => { event.stopPropagation(); onQueue(node.path); }}>Review</button>}</span></div>)}</div>;
}

function DetailPanel({ node, onOpen, onQueue }: { node: IndexedNode | null; onOpen: (path: string) => void; onQueue: (path: string) => void }) {
  if (!node) return <aside className="detail-panel panel"><EmptyState title="Select an item" detail="Choose a row to inspect its path, dates, size, and attributes." /></aside>;
  return <aside className="detail-panel panel"><span className="eyebrow"><b>Inspector</b></span><div className={`detail-glyph ${node.kind}`}>{node.kind === "dir" ? "▰" : "▪"}</div><h2>{node.name}</h2><p>{node.path}</p><dl><div><dt>Size</dt><dd>{FORMAT_SIZE(node.size_bytes)}</dd></div><div><dt>Modified</dt><dd>{formatDate(node.modified_unix)}</dd></div><div><dt>Extension</dt><dd>{node.file_ext || "—"}</dd></div><div><dt>Attributes</dt><dd>{[node.readonly && "read-only", node.is_symlink && "link"].filter(Boolean).join(", ") || "standard"}</dd></div></dl><button className="quiet-action" onClick={() => onOpen(node.path)}>Open in file manager</button>{node.kind === "file" && <button className="text-button warm" onClick={() => onQueue(node.path)}>Add to cleanup review</button>}</aside>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><i>◌</i><strong>{title}</strong><p>{detail}</p></div>;
}
