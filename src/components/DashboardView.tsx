import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ScanSummary, TreeNodeDelta, NodeId } from '../types';
import { FORMAT_SIZE } from '../constants';
import { invoke } from '@tauri-apps/api/core';
import type { FileInfo } from '../types';
import Treemap from './Treemap';
import DirectoryTree from './DirectoryTree';
import FileTable from './FileTable';
import SearchBar from './SearchBar';
import ContextMenu from './ContextMenu';
import ExtensionLegend from './ExtensionLegend';

interface TreeNodeMap {
  [id: number]: TreeNodeDelta & { children: NodeId[] };
}

interface DashboardViewProps {
  onOpenFilter?: (ext: string) => void;
  onExtensionClick?: (ext: string) => void;
  onRescan?: () => void;
  onNewScan?: () => void;
  summary: ScanSummary | null;
  rootPath?: string | null;
  treeNodes: TreeNodeMap;
  rootNodeId: NodeId | null;
}

type ViewMode = 'treemap' | 'tree' | 'table';
type SizeFilter = 'all' | 'large' | 'medium' | 'small';

const DashboardView: React.FC<DashboardViewProps> = ({ 
  onOpenFilter, 
  onExtensionClick, 
  onRescan, 
  onNewScan,
  summary, 
  rootPath, 
  treeNodes, 
  rootNodeId,
}) => {
  // State
  const [viewMode, setViewMode] = useState<ViewMode>('treemap');
  const [searchFilter, setSearchFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('all');
  const [highlightExtension, setHighlightExtension] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    node: TreeNodeDelta & { children: NodeId[] };
    x: number;
    y: number;
  } | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const treemapContainerRef = useRef<HTMLDivElement>(null);
  const [treemapSize, setTreemapSize] = useState({ width: 800, height: 400 });

  // Resize observer for treemap
  useEffect(() => {
    if (!treemapContainerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTreemapSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    resizeObserver.observe(treemapContainerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Handlers
  const handleExtensionClick = useCallback((ext: string | null) => {
    setHighlightExtension(ext);
    if (ext && onExtensionClick) onExtensionClick(ext);
    else if (ext && onOpenFilter) onOpenFilter(ext);
  }, [onExtensionClick, onOpenFilter]);

  const handleNodeSelect = useCallback((node: TreeNodeDelta & { children: NodeId[] }) => {
    setSelectedNodeId(node.id);
  }, []);

  const handleNodeRightClick = useCallback((node: TreeNodeDelta & { children: NodeId[] }, e: React.MouseEvent) => {
    setContextMenu({ node, x: e.clientX, y: e.clientY });
  }, []);

  const handleOpenInExplorer = useCallback(async (path: string) => {
    try {
      await invoke('open_in_explorer', { path });
      setNotification({ message: 'Opened in Explorer', type: 'success' });
    } catch (err) {
      setNotification({ message: `Failed to open: ${err}`, type: 'error' });
    }
  }, []);

  const handleDelete = useCallback(async (path: string, toTrash: boolean) => {
    try {
      const fileInfo = await invoke<FileInfo>('get_file_details', { path });

      if (fileInfo.safety_level === 'Protected') {
        setNotification({ message: 'Protected system files cannot be deleted', type: 'error' });
        return;
      }

      await invoke('delete_path', { path, toTrash });
      setNotification({ 
        message: toTrash ? 'Moved to Trash' : 'Deleted permanently', 
        type: 'success' 
      });
      // Trigger rescan to update the tree
      if (onRescan) onRescan();
    } catch (err) {
      setNotification({ message: `Failed to delete: ${err}`, type: 'error' });
    }
  }, [onRescan]);

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path);
    setNotification({ message: 'Path copied to clipboard', type: 'success' });
  }, []);

  const handleNodeDoubleClick = useCallback((node: TreeNodeDelta & { children: NodeId[] }) => {
    handleOpenInExplorer(node.path);
  }, [handleOpenInExplorer]);

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const totalBytes = summary?.total_bytes ?? 0;
  const totalFiles = summary?.total_files ?? 0;
  const totalDirs = summary?.total_dirs ?? 0;

  return (
    <div className="app-shell flex-1 flex flex-col h-full overflow-hidden min-h-screen">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-in ${
          notification.type === 'success' 
            ? 'bg-green-500/90 text-white' 
            : 'bg-red-500/90 text-white'
        }`}>
          <span className="material-symbols-outlined text-base">
            {notification.type === 'success' ? 'check_circle' : 'error'}
          </span>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          node={contextMenu.node}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onOpenInExplorer={handleOpenInExplorer}
          onDelete={handleDelete}
          onCopyPath={handleCopyPath}
        />
      )}

      {/* Navigation Strip */}
      <div className="app-surface-muted flex items-center justify-between px-8 py-3 border-b backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
            <span className="material-symbols-outlined text-base">domain</span>
            Node:
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-900 dark:text-white">ROOT</span>
            <span className="text-slate-300 dark:text-slate-400">/</span>
            <span className="text-secondary font-black">{rootPath ?? 'UNSET'}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-12">
          <div className="flex flex-col items-end">
            <span className="text-[9px] uppercase font-black text-slate-400 tracking-[0.2em] mb-0.5">Total Size</span>
            <span className="text-xl font-black text-slate-900 dark:text-white leading-none">{FORMAT_SIZE(totalBytes)}</span>
          </div>
          <div className="flex flex-col items-end border-l border-slate-200 dark:border-slate-800 pl-8">
            <span className="text-[9px] uppercase font-black text-slate-400 tracking-[0.2em] mb-0.5">Files</span>
            <span className="text-xl font-black text-slate-900 dark:text-white leading-none">{totalFiles.toLocaleString()}</span>
          </div>
          <div className="flex flex-col items-end border-l border-slate-200 dark:border-slate-800 pl-8">
            <span className="text-[9px] uppercase font-black text-slate-400 tracking-[0.2em] mb-0.5">Folders</span>
            <span className="text-xl font-black text-slate-900 dark:text-white leading-none">{totalDirs.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-8">
            <button 
              onClick={onRescan}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
              title="Rescan"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
            </button>
            <button 
              onClick={onNewScan}
              className="p-2 rounded-lg bg-secondary hover:brightness-110 text-white transition-all"
              title="New Scan"
            >
              <span className="material-symbols-outlined text-lg">add</span>
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="app-surface-muted flex items-center justify-between px-8 py-3 border-b shrink-0">
        {/* Search Bar */}
        <div className="flex-1 max-w-md">
          <SearchBar
            value={searchFilter}
            onChange={setSearchFilter}
            sizeFilter={sizeFilter}
            onSizeFilterChange={setSizeFilter}
          />
        </div>

        {/* View Mode Toggle */}
        <div className="app-surface flex items-center gap-1 rounded-xl p-1 border">
          <button
            onClick={() => setViewMode('treemap')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              viewMode === 'treemap'
                ? 'app-surface-muted text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-base align-middle mr-1">grid_view</span>
            Treemap
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              viewMode === 'tree'
                ? 'app-surface-muted text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-base align-middle mr-1">account_tree</span>
            Tree
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              viewMode === 'table'
                ? 'app-surface-muted text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-base align-middle mr-1">table_rows</span>
            Table
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 grid grid-cols-12 gap-6 overflow-hidden min-h-0">
        {/* Main Visualization */}
        <section className="app-surface col-span-12 lg:col-span-9 rounded-2xl border shadow-2xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
            <h2 className="font-black text-sm uppercase tracking-widest flex items-center gap-3">
              <span className="w-1 h-4 bg-secondary rounded-full"></span>
              {viewMode === 'treemap' ? 'Space Allocation' : viewMode === 'tree' ? 'Directory Structure' : 'File List'}
            </h2>
            {highlightExtension && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/20 rounded-lg">
                <span className="text-xs font-bold text-cyan-400">Filtering: .{highlightExtension}</span>
                <button onClick={() => setHighlightExtension(null)} className="text-cyan-400 hover:text-cyan-300">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            )}
          </div>
          
          <div ref={treemapContainerRef} className="flex-1 overflow-hidden">
            {viewMode === 'treemap' && (
              <Treemap
                treeNodes={treeNodes}
                rootNodeId={rootNodeId}
                totalBytes={totalBytes}
                width={treemapSize.width}
                height={treemapSize.height}
                onNodeClick={handleNodeSelect}
                onNodeRightClick={handleNodeRightClick}
                highlightExtension={highlightExtension}
              />
            )}
            {viewMode === 'tree' && (
              <DirectoryTree
                treeNodes={treeNodes}
                rootNodeId={rootNodeId}
                selectedNodeId={selectedNodeId}
                onNodeSelect={handleNodeSelect}
                onNodeRightClick={handleNodeRightClick}
                highlightExtension={highlightExtension}
                maxHeight="100%"
              />
            )}
            {viewMode === 'table' && (
              <FileTable
                treeNodes={treeNodes}
                rootNodeId={rootNodeId}
                selectedNodeId={selectedNodeId}
                onNodeSelect={handleNodeSelect}
                onNodeRightClick={handleNodeRightClick}
                onNodeDoubleClick={handleNodeDoubleClick}
                searchFilter={searchFilter}
                extensionFilter={highlightExtension}
                sizeFilter={sizeFilter}
                maxHeight="100%"
                onDeleteComplete={(_path, name) => {
                  setNotification({ message: `${name} deleted`, type: 'success' });
                  onRescan?.();
                }}
                onDeleteError={(message) => setNotification({ message, type: 'error' })}
              />
            )}
          </div>
        </section>

        {/* Right Sidebar - Extension Legend */}
        <section className="app-surface col-span-12 lg:col-span-3 rounded-2xl border shadow-2xl overflow-hidden flex flex-col">
          <ExtensionLegend
            treeNodes={treeNodes}
            highlightExtension={highlightExtension}
            onExtensionClick={handleExtensionClick}
          />
        </section>
      </div>
    </div>
  );
};

export default DashboardView;
