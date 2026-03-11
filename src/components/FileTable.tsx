import React, { useState, useMemo, useCallback } from 'react';
import type { TreeNodeDelta, NodeId } from '../types';
import { FORMAT_SIZE } from '../constants';
import SmartDeleteButton from './SmartDeleteButton';

interface TreeNodeMap {
  [id: number]: TreeNodeDelta & { children: NodeId[] };
}

type SortField = 'name' | 'size' | 'path' | 'ext';
type SortDirection = 'asc' | 'desc';

interface FileTableProps {
  treeNodes: TreeNodeMap;
  rootNodeId: NodeId | null;
  selectedNodeId: NodeId | null;
  onNodeSelect?: (node: TreeNodeDelta & { children: NodeId[] }) => void;
  onNodeRightClick?: (node: TreeNodeDelta & { children: NodeId[] }, e: React.MouseEvent) => void;
  onNodeDoubleClick?: (node: TreeNodeDelta & { children: NodeId[] }) => void;
  searchFilter?: string;
  extensionFilter?: string | null;
  sizeFilter?: 'all' | 'large' | 'medium' | 'small';
  maxHeight?: string;
  onDeleteComplete?: (path: string, name: string) => void;
  onDeleteError?: (message: string) => void;
}

interface FlattenedFile {
  id: NodeId;
  name: string;
  path: string;
  size: number;
  ext: string | null;
  kind: 'file' | 'dir';
  node: TreeNodeDelta & { children: NodeId[] };
}

const FileTable: React.FC<FileTableProps> = ({
  treeNodes,
  rootNodeId,
  selectedNodeId,
  onNodeSelect,
  onNodeRightClick,
  onNodeDoubleClick,
  searchFilter = '',
  extensionFilter,
  sizeFilter = 'all',
  maxHeight = '400px',
  onDeleteComplete,
  onDeleteError,
}) => {
  const [sortField, setSortField] = useState<SortField>('size');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Flatten all files from tree
  const allFiles = useMemo<FlattenedFile[]>(() => {
    const files: FlattenedFile[] = [];
    
    const traverse = (nodeId: NodeId) => {
      const node = treeNodes[nodeId];
      if (!node) return;

      files.push({
        id: node.id,
        name: node.name,
        path: node.path,
        size: node.size_bytes,
        ext: node.file_ext,
        kind: node.kind,
        node,
      });

      for (const childId of node.children) {
        traverse(childId);
      }
    };

    if (rootNodeId) {
      traverse(rootNodeId);
    }

    return files;
  }, [treeNodes, rootNodeId]);

  // Filter files
  const filteredFiles = useMemo(() => {
    let result = allFiles;

    // Search filter
    if (searchFilter) {
      const search = searchFilter.toLowerCase();
      result = result.filter(f => 
        f.name.toLowerCase().includes(search) || 
        f.path.toLowerCase().includes(search)
      );
    }

    // Extension filter
    if (extensionFilter) {
      const ext = extensionFilter.toLowerCase().replace(/^\./, '');
      result = result.filter(f => {
        const fileExt = f.ext?.toLowerCase().replace(/^\./, '') || '';
        return fileExt === ext;
      });
    }

    // Size filter
    if (sizeFilter !== 'all') {
      result = result.filter(f => {
        const mb = f.size / (1024 * 1024);
        if (sizeFilter === 'large') return mb >= 100;
        if (sizeFilter === 'medium') return mb >= 10 && mb < 100;
        if (sizeFilter === 'small') return mb < 10;
        return true;
      });
    }

    return result;
  }, [allFiles, searchFilter, extensionFilter, sizeFilter]);

  // Sort files
  const sortedFiles = useMemo(() => {
    const sorted = [...filteredFiles];
    
    sorted.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'path':
          comparison = a.path.localeCompare(b.path);
          break;
        case 'ext':
          comparison = (a.ext || '').localeCompare(b.ext || '');
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted.slice(0, 500); // Limit for performance
  }, [filteredFiles, sortField, sortDirection]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField]);

  const getIcon = (file: FlattenedFile) => {
    if (file.kind === 'dir') return 'folder';
    const ext = file.ext?.toLowerCase().replace(/^\./, '') || '';
    if (['mp4', 'mkv', 'avi', 'mov', 'wmv'].includes(ext)) return 'movie';
    if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) return 'audio_file';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(ext)) return 'description';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'folder_zip';
    if (['exe', 'msi', 'bat', 'sh'].includes(ext)) return 'terminal';
    return 'draft';
  };

  const getIconColor = (file: FlattenedFile) => {
    if (file.kind === 'dir') return 'text-amber-400';
    const ext = file.ext?.toLowerCase().replace(/^\./, '') || '';
    if (['mp4', 'mkv', 'avi', 'mov', 'wmv'].includes(ext)) return 'text-purple-400';
    if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) return 'text-pink-400';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'text-blue-400';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(ext)) return 'text-orange-400';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'text-green-400';
    if (['exe', 'msi', 'bat', 'sh'].includes(ext)) return 'text-red-400';
    return 'text-slate-400';
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) {
      return <span className="material-symbols-outlined text-xs text-slate-600 dark:text-slate-300">unfold_more</span>;
    }
    return (
      <span className="material-symbols-outlined text-xs text-cyan-400">
        {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
      </span>
    );
  };

  const totalSize = sortedFiles.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700/50">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-cyan-400">table_rows</span>
          Files ({sortedFiles.length.toLocaleString()})
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Total: {FORMAT_SIZE(totalSize)}
        </span>
      </div>

      {/* Table */}
      <div 
        className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent"
        style={{ maxHeight }}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 app-surface-muted backdrop-blur-sm">
            <tr className="text-left text-xs text-slate-500 dark:text-slate-300">
              <th 
                className="px-4 py-2 font-medium cursor-pointer hover:text-slate-800 dark:hover:text-white transition-colors"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-1">
                  Name <SortIcon field="name" />
                </div>
              </th>
              <th 
                className="px-4 py-2 font-medium cursor-pointer hover:text-slate-800 dark:hover:text-white transition-colors text-right w-24"
                onClick={() => handleSort('size')}
              >
                <div className="flex items-center justify-end gap-1">
                  Size <SortIcon field="size" />
                </div>
              </th>
              <th 
                className="px-4 py-2 font-medium cursor-pointer hover:text-slate-800 dark:hover:text-white transition-colors w-20"
                onClick={() => handleSort('ext')}
              >
                <div className="flex items-center gap-1">
                  Type <SortIcon field="ext" />
                </div>
              </th>
              <th 
                className="px-4 py-2 font-medium cursor-pointer hover:text-slate-800 dark:hover:text-white transition-colors hidden lg:table-cell"
                onClick={() => handleSort('path')}
              >
                <div className="flex items-center gap-1">
                  Path <SortIcon field="path" />
                </div>
              </th>
              <th className="px-4 py-2 font-medium text-right w-20">
                Delete
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedFiles.map(file => (
              <tr
                key={file.id}
                className={`border-b border-slate-200 dark:border-slate-700/30 cursor-pointer transition-colors ${
                  selectedNodeId === file.id
                    ? 'bg-cyan-500/20'
                    : 'hover:bg-slate-200 dark:hover:bg-slate-700/50'
                }`}
                onClick={() => onNodeSelect?.(file.node)}
                onDoubleClick={() => onNodeDoubleClick?.(file.node)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onNodeRightClick?.(file.node, e);
                }}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`material-symbols-outlined text-base ${getIconColor(file)}`}>
                      {getIcon(file)}
                    </span>
                    <span className="truncate max-w-xs text-slate-800 dark:text-slate-200" title={file.name}>
                      {file.name}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-200">
                  {FORMAT_SIZE(file.size)}
                </td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-300">
                  {file.kind === 'dir' ? 'Folder' : file.ext?.replace(/^\./, '').toUpperCase() || '-'}
                </td>
                <td 
                  className="px-4 py-2 text-slate-400 dark:text-slate-300 truncate max-w-sm hidden lg:table-cell" 
                  title={file.path}
                >
                  {file.path}
                </td>
                <td className="px-4 py-2 text-right">
                  {file.kind === 'file' && (
                    <SmartDeleteButton
                      path={file.path}
                      name={file.name}
                      title={`Delete ${file.name}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:text-slate-300"
                      onDeleted={() => onDeleteComplete?.(file.path, file.name)}
                      onError={(message) => onDeleteError?.(message)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Empty state */}
        {sortedFiles.length === 0 && (
          <div className="flex items-center justify-center h-32 text-slate-400">
            <div className="text-center">
              <span className="material-symbols-outlined text-3xl mb-2">search_off</span>
              <p className="text-sm">No files match your filters</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileTable;
