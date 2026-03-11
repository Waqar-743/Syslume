import React, { useState, useCallback, useMemo } from 'react';
import type { TreeNodeDelta, NodeId } from '../types';
import { FORMAT_SIZE } from '../constants';

interface TreeNodeMap {
  [id: number]: TreeNodeDelta & { children: NodeId[] };
}

interface DirectoryTreeProps {
  treeNodes: TreeNodeMap;
  rootNodeId: NodeId | null;
  selectedNodeId: NodeId | null;
  onNodeSelect?: (node: TreeNodeDelta & { children: NodeId[] }) => void;
  onNodeRightClick?: (node: TreeNodeDelta & { children: NodeId[] }, e: React.MouseEvent) => void;
  highlightExtension?: string | null;
  maxHeight?: string;
}

interface TreeItemProps {
  nodeId: NodeId;
  treeNodes: TreeNodeMap;
  depth: number;
  expandedNodes: Set<NodeId>;
  selectedNodeId: NodeId | null;
  highlightExtension?: string | null;
  onToggle: (id: NodeId) => void;
  onSelect: (node: TreeNodeDelta & { children: NodeId[] }) => void;
  onRightClick: (node: TreeNodeDelta & { children: NodeId[] }, e: React.MouseEvent) => void;
}

const TreeItem: React.FC<TreeItemProps> = ({
  nodeId,
  treeNodes,
  depth,
  expandedNodes,
  selectedNodeId,
  highlightExtension,
  onToggle,
  onSelect,
  onRightClick,
}) => {
  const node = treeNodes[nodeId];
  if (!node) return null;

  const isExpanded = expandedNodes.has(nodeId);
  const isSelected = selectedNodeId === nodeId;
  const hasChildren = node.children.length > 0;
  const isDir = node.kind === 'dir';

  // Sort children: directories first, then by size
  const sortedChildren = useMemo(() => {
    return [...node.children]
      .map(id => treeNodes[id])
      .filter(Boolean)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
        return b.size_bytes - a.size_bytes;
      })
      .slice(0, 100); // Limit for performance
  }, [node.children, treeNodes]);

  // Extension highlighting
  const isHighlighted = useMemo(() => {
    if (!highlightExtension) return true;
    if (isDir) return true;
    const ext = node.file_ext?.toLowerCase().replace(/^\./, '') || '';
    return ext === highlightExtension.toLowerCase().replace(/^\./, '');
  }, [highlightExtension, isDir, node.file_ext]);

  const getIcon = () => {
    if (isDir) {
      return isExpanded ? 'folder_open' : 'folder';
    }
    const ext = node.file_ext?.toLowerCase().replace(/^\./, '') || '';
    if (['mp4', 'mkv', 'avi', 'mov', 'wmv'].includes(ext)) return 'movie';
    if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) return 'audio_file';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(ext)) return 'description';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'folder_zip';
    if (['exe', 'msi', 'bat', 'sh'].includes(ext)) return 'terminal';
    return 'draft';
  };

  const getIconColor = () => {
    if (isDir) return 'text-amber-400';
    const ext = node.file_ext?.toLowerCase().replace(/^\./, '') || '';
    if (['mp4', 'mkv', 'avi', 'mov', 'wmv'].includes(ext)) return 'text-purple-400';
    if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) return 'text-pink-400';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'text-blue-400';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(ext)) return 'text-orange-400';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'text-green-400';
    if (['exe', 'msi', 'bat', 'sh'].includes(ext)) return 'text-red-400';
    return 'text-slate-400';
  };

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-1 py-1 px-2 rounded-lg cursor-pointer transition-all ${
          isSelected
            ? 'bg-cyan-500/20 border border-cyan-500/30'
            : 'hover:bg-slate-200 dark:hover:bg-slate-700/50 border border-transparent'
        } ${!isHighlighted ? 'opacity-30' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (isDir && hasChildren) {
            onToggle(nodeId);
          }
          onSelect(node);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onRightClick(node, e);
        }}
      >
        {/* Expand/collapse button */}
        <div className="w-4 h-4 flex items-center justify-center">
          {isDir && hasChildren ? (
            <span className="material-symbols-outlined text-sm text-slate-400">
              {isExpanded ? 'expand_more' : 'chevron_right'}
            </span>
          ) : null}
        </div>

        {/* Icon */}
        <span className={`material-symbols-outlined text-base ${getIconColor()}`}>
          {getIcon()}
        </span>

        {/* Name */}
        <span className="flex-1 truncate text-sm text-slate-800 dark:text-white">
          {node.name}
        </span>

        {/* Size */}
        <span className="text-xs text-slate-500 dark:text-slate-300 tabular-nums">
          {FORMAT_SIZE(node.size_bytes)}
        </span>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {sortedChildren.map(child => (
            <TreeItem
              key={child.id}
              nodeId={child.id}
              treeNodes={treeNodes}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              selectedNodeId={selectedNodeId}
              highlightExtension={highlightExtension}
              onToggle={onToggle}
              onSelect={onSelect}
              onRightClick={onRightClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const DirectoryTree: React.FC<DirectoryTreeProps> = ({
  treeNodes,
  rootNodeId,
  selectedNodeId,
  onNodeSelect,
  onNodeRightClick,
  highlightExtension,
  maxHeight = '400px',
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<NodeId>>(() => {
    // Auto-expand root
    if (rootNodeId) return new Set([rootNodeId]);
    return new Set();
  });

  const handleToggle = useCallback((nodeId: NodeId) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback((node: TreeNodeDelta & { children: NodeId[] }) => {
    onNodeSelect?.(node);
  }, [onNodeSelect]);

  const handleRightClick = useCallback((node: TreeNodeDelta & { children: NodeId[] }, e: React.MouseEvent) => {
    onNodeRightClick?.(node, e);
  }, [onNodeRightClick]);

  const expandAll = useCallback(() => {
    const allDirIds = new Set<NodeId>();
    Object.values(treeNodes).forEach(node => {
      if (node.kind === 'dir' && node.children.length > 0) {
        allDirIds.add(node.id);
      }
    });
    setExpandedNodes(allDirIds);
  }, [treeNodes]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(rootNodeId ? new Set([rootNodeId]) : new Set());
  }, [rootNodeId]);

  if (!rootNodeId || !treeNodes[rootNodeId]) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center">
          <span className="material-symbols-outlined text-3xl mb-2">account_tree</span>
          <p className="text-sm">No directory tree available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700/50">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-cyan-400">account_tree</span>
          Directory Tree
        </h3>
        <div className="flex gap-1">
          <button
            onClick={expandAll}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white transition-colors"
            title="Expand all"
          >
            <span className="material-symbols-outlined text-sm">unfold_more</span>
          </button>
          <button
            onClick={collapseAll}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white transition-colors"
            title="Collapse all"
          >
            <span className="material-symbols-outlined text-sm">unfold_less</span>
          </button>
        </div>
      </div>

      {/* Tree */}
      <div 
        className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent"
        style={{ maxHeight }}
      >
        <div className="py-2">
          <TreeItem
            nodeId={rootNodeId}
            treeNodes={treeNodes}
            depth={0}
            expandedNodes={expandedNodes}
            selectedNodeId={selectedNodeId}
            highlightExtension={highlightExtension}
            onToggle={handleToggle}
            onSelect={handleSelect}
            onRightClick={handleRightClick}
          />
        </div>
      </div>
    </div>
  );
};

export default DirectoryTree;
