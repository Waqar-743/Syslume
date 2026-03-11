import React, { useMemo } from 'react';
import type { TreeNodeDelta, NodeId } from '../types';
import { FORMAT_SIZE } from '../constants';

interface TreeNodeMap {
  [id: number]: TreeNodeDelta & { children: NodeId[] };
}

interface ExtensionStats {
  extension: string;
  count: number;
  size: number;
  color: string;
}

interface ExtensionLegendProps {
  treeNodes: TreeNodeMap;
  highlightExtension: string | null;
  onExtensionClick: (ext: string | null) => void;
}

// Color palette for extensions
const EXTENSION_COLORS: Record<string, string> = {
  // Video
  mp4: '#a855f7', mkv: '#a855f7', avi: '#a855f7', mov: '#a855f7', wmv: '#a855f7', flv: '#a855f7',
  // Audio
  mp3: '#ec4899', wav: '#ec4899', flac: '#ec4899', aac: '#ec4899', ogg: '#ec4899', m4a: '#ec4899',
  // Images
  jpg: '#3b82f6', jpeg: '#3b82f6', png: '#3b82f6', gif: '#3b82f6', webp: '#3b82f6', bmp: '#3b82f6', svg: '#3b82f6',
  // Documents
  pdf: '#f59e0b', doc: '#f59e0b', docx: '#f59e0b', xls: '#f59e0b', xlsx: '#f59e0b', ppt: '#f59e0b', pptx: '#f59e0b', txt: '#f59e0b',
  // Archives
  zip: '#22c55e', rar: '#22c55e', '7z': '#22c55e', tar: '#22c55e', gz: '#22c55e',
  // Code
  js: '#06b6d4', ts: '#06b6d4', jsx: '#06b6d4', tsx: '#06b6d4', py: '#06b6d4', rs: '#06b6d4', go: '#06b6d4', java: '#06b6d4', cpp: '#06b6d4', c: '#06b6d4', cs: '#06b6d4',
  // Executables
  exe: '#ef4444', dll: '#ef4444', msi: '#ef4444', bat: '#ef4444', sh: '#ef4444',
  // Data
  json: '#8b5cf6', xml: '#8b5cf6', csv: '#8b5cf6', sql: '#8b5cf6', db: '#8b5cf6',
};

const getColorForExtension = (ext: string): string => {
  const normalizedExt = ext.toLowerCase().replace(/^\./, '');
  return EXTENSION_COLORS[normalizedExt] || '#64748b';
};

const ExtensionLegend: React.FC<ExtensionLegendProps> = ({
  treeNodes,
  highlightExtension,
  onExtensionClick,
}) => {
  const extensionStats = useMemo<ExtensionStats[]>(() => {
    const stats: Record<string, { count: number; size: number }> = {};

    Object.values(treeNodes).forEach(node => {
      if (node.kind === 'file' && node.file_ext) {
        const ext = node.file_ext.toLowerCase().replace(/^\./, '');
        if (!stats[ext]) {
          stats[ext] = { count: 0, size: 0 };
        }
        stats[ext].count++;
        stats[ext].size += node.size_bytes;
      }
    });

    return Object.entries(stats)
      .map(([ext, data]) => ({
        extension: ext,
        count: data.count,
        size: data.size,
        color: getColorForExtension(ext),
      }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 15);
  }, [treeNodes]);

  const totalSize = extensionStats.reduce((sum, s) => sum + s.size, 0);

  // Group by category
  const categories = useMemo(() => {
    const cats: Record<string, { name: string; color: string; extensions: ExtensionStats[] }> = {
      video: { name: 'Video', color: '#a855f7', extensions: [] },
      audio: { name: 'Audio', color: '#ec4899', extensions: [] },
      images: { name: 'Images', color: '#3b82f6', extensions: [] },
      documents: { name: 'Documents', color: '#f59e0b', extensions: [] },
      archives: { name: 'Archives', color: '#22c55e', extensions: [] },
      code: { name: 'Code', color: '#06b6d4', extensions: [] },
      executables: { name: 'Executables', color: '#ef4444', extensions: [] },
      data: { name: 'Data', color: '#8b5cf6', extensions: [] },
      other: { name: 'Other', color: '#64748b', extensions: [] },
    };

    extensionStats.forEach(stat => {
      const ext = stat.extension;
      if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) cats.video.extensions.push(stat);
      else if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) cats.audio.extensions.push(stat);
      else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) cats.images.extensions.push(stat);
      else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(ext)) cats.documents.extensions.push(stat);
      else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) cats.archives.extensions.push(stat);
      else if (['js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'go', 'java', 'cpp', 'c', 'cs'].includes(ext)) cats.code.extensions.push(stat);
      else if (['exe', 'dll', 'msi', 'bat', 'sh'].includes(ext)) cats.executables.extensions.push(stat);
      else if (['json', 'xml', 'csv', 'sql', 'db'].includes(ext)) cats.data.extensions.push(stat);
      else cats.other.extensions.push(stat);
    });

    return Object.values(cats).filter(c => c.extensions.length > 0);
  }, [extensionStats]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700/50">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-cyan-400">palette</span>
          File Types
        </h3>
        {highlightExtension && (
          <button
            onClick={() => onExtensionClick(null)}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-xs">close</span>
            Clear filter
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {extensionStats.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
              <span className="material-symbols-outlined text-3xl mb-2">category</span>
              <p className="text-sm">No file types found</p>
            </div>
          </div>
        ) : (
          <>
            {/* Extension list */}
            <div className="space-y-1">
              {extensionStats.map(stat => {
                const percentage = totalSize > 0 ? (stat.size / totalSize) * 100 : 0;
                const isSelected = highlightExtension?.toLowerCase().replace(/^\./, '') === stat.extension;

                return (
                  <button
                    key={stat.extension}
                    onClick={() => onExtensionClick(isSelected ? null : stat.extension)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                      isSelected
                        ? 'bg-cyan-500/20 border border-cyan-500/40'
                        : 'hover:bg-slate-200 dark:hover:bg-slate-700/50 border border-transparent'
                    }`}
                  >
                    {/* Color dot */}
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: stat.color }}
                    />

                    {/* Extension name */}
                    <span className="text-sm font-mono text-slate-800 dark:text-white flex-shrink-0">
                      .{stat.extension}
                    </span>

                    {/* Progress bar */}
                    <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700/50 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: stat.color,
                        }}
                      />
                    </div>

                    {/* Size */}
                    <span className="text-xs text-slate-400 dark:text-slate-300 tabular-nums flex-shrink-0">
                      {FORMAT_SIZE(stat.size)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Categories summary */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700/50">
              <h4 className="text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wide mb-3">By Category</h4>
              <div className="grid grid-cols-2 gap-2">
                {categories.map(cat => {
                  const catSize = cat.extensions.reduce((sum, e) => sum + e.size, 0);
                  return (
                    <div key={cat.name} className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-200">{cat.name}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-300 ml-auto tabular-nums">
                        {FORMAT_SIZE(catSize)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ExtensionLegend;
