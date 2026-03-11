import React, { useEffect, useRef, useState } from 'react';
import type { TreeNodeDelta, NodeId, FileInfo, SafetyLevel } from '../types';
import { FORMAT_SIZE } from '../constants';
import { invoke } from '@tauri-apps/api/core';
import DeleteConfirmDialog from './DeleteConfirmDialog';

interface ContextMenuProps {
  node: TreeNodeDelta & { children: NodeId[] };
  x: number;
  y: number;
  onClose: () => void;
  onOpenInExplorer: (path: string) => void;
  onDelete: (path: string, toTrash: boolean) => void;
  onCopyPath: (path: string) => void;
  onDeleteComplete?: (path: string, bytesFreed: number) => void;
}

const SAFETY_COLORS: Record<SafetyLevel, string> = {
  AutoDelete: 'text-green-400',
  ConfirmRequired: 'text-amber-400',
  Protected: 'text-red-400',
};

const SAFETY_LABELS: Record<SafetyLevel, string> = {
  AutoDelete: 'Safe to delete',
  ConfirmRequired: 'Needs confirmation',
  Protected: 'Protected file',
};

const ContextMenu: React.FC<ContextMenuProps> = ({
  node,
  x,
  y,
  onClose,
  onOpenInExplorer,
  onDelete,
  onCopyPath,
  onDeleteComplete,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch file info on mount
  useEffect(() => {
    const fetchFileInfo = async () => {
      try {
        const info = await invoke<FileInfo>('get_file_details', { path: node.path });
        setFileInfo(info);
      } catch (err) {
        console.error('Failed to get file info:', err);
        // Fallback to basic info
        setFileInfo({
          path: node.path,
          name: node.name,
          size_bytes: node.size_bytes,
          safety_level: 'ConfirmRequired',
          is_dir: node.kind === 'dir',
          modified_days_ago: null,
          extension: node.file_ext,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchFileInfo();
  }, [node]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !showConfirmDialog) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showConfirmDialog) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, showConfirmDialog]);

  const handleSmartDelete = async () => {
    if (!fileInfo) return;

    if (fileInfo.safety_level === 'Protected') {
      // Can't delete protected files
      return;
    }

    if (fileInfo.safety_level === 'AutoDelete') {
      // Auto-delete without confirmation
      await performDelete();
    } else {
      // Show confirmation dialog for ConfirmRequired
      setShowConfirmDialog(true);
    }
  };

  const performDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await invoke<{ success: boolean; bytes_freed: number; errors: string[] }>('smart_delete', {
        path: node.path,
        force: true, // User confirmed or it's auto-delete
      });

      if (result.success) {
        onDeleteComplete?.(node.path, result.bytes_freed);
        onClose();
      } else {
        console.error('Delete failed:', result.errors);
        alert(`Delete failed: ${result.errors.join(', ')}`);
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert(`Failed to delete: ${err}`);
    } finally {
      setIsDeleting(false);
      setShowConfirmDialog(false);
    }
  };

  // Adjust position to stay in viewport
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 380);

  const menuItems = [
    {
      icon: 'folder_open',
      label: 'Open in Explorer',
      onClick: () => {
        onOpenInExplorer(node.path);
        onClose();
      },
    },
    {
      icon: 'content_copy',
      label: 'Copy Path',
      onClick: () => {
        onCopyPath(node.path);
        onClose();
      },
    },
    { type: 'separator' as const },
    {
      icon: 'auto_delete',
      label: 'Smart Delete',
      onClick: handleSmartDelete,
      danger: true,
      badge: fileInfo ? {
        label: SAFETY_LABELS[fileInfo.safety_level],
        color: SAFETY_COLORS[fileInfo.safety_level],
      } : undefined,
      disabled: loading || fileInfo?.safety_level === 'Protected',
    },
    { type: 'separator' as const },
    {
      icon: 'delete',
      label: 'Move to Trash',
      onClick: () => {
        onDelete(node.path, true);
        onClose();
      },
      danger: true,
      secondary: true,
      disabled: loading || fileInfo?.safety_level === 'Protected',
    },
    {
      icon: 'delete_forever',
      label: 'Delete Permanently',
      onClick: () => {
        if (confirm(`Permanently delete "${node.name}"?\n\nThis action cannot be undone.`)) {
          onDelete(node.path, false);
          onClose();
        }
      },
      danger: true,
      secondary: true,
      disabled: loading || fileInfo?.safety_level === 'Protected',
    },
  ];

  return (
    <>
      <div
        ref={menuRef}
        className="fixed z-50 min-w-[220px] bg-slate-800 dark:bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden"
        style={{ left: adjustedX, top: adjustedY }}
      >
        {/* Header with file info */}
        <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/80 dark:bg-slate-900/80">
          <div className="flex items-center gap-2">
            <span className={`material-symbols-outlined text-lg ${node.kind === 'dir' ? 'text-amber-400' : 'text-cyan-400'}`}>
              {node.kind === 'dir' ? 'folder' : 'draft'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{node.name}</div>
              <div className="text-xs text-slate-400">{FORMAT_SIZE(node.size_bytes)}</div>
            </div>
          </div>
          
          {/* Safety level indicator */}
          {fileInfo && !loading && (
            <div className={`mt-2 flex items-center gap-1.5 text-xs ${SAFETY_COLORS[fileInfo.safety_level]}`}>
              <span className="material-symbols-outlined text-sm">
                {fileInfo.safety_level === 'AutoDelete' ? 'check_circle' : 
                 fileInfo.safety_level === 'Protected' ? 'shield' : 'warning'}
              </span>
              {SAFETY_LABELS[fileInfo.safety_level]}
            </div>
          )}
          {loading && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
              Checking...
            </div>
          )}
        </div>

        {/* Menu items */}
        <div className="py-1">
          {menuItems.map((item, i) => {
            if (item.type === 'separator') {
              return <div key={i} className="my-1 border-t border-slate-700/50" />;
            }

            const isDisabled = 'disabled' in item && item.disabled;
            const isSecondary = 'secondary' in item && item.secondary;

            return (
              <button
                key={i}
                onClick={item.onClick}
                disabled={isDisabled}
                className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                  isDisabled
                    ? 'text-slate-500 cursor-not-allowed'
                    : item.danger
                      ? isSecondary
                        ? 'text-slate-400 hover:bg-slate-700/50 hover:text-red-400'
                        : 'text-red-400 hover:bg-red-500/20'
                      : 'text-slate-300 hover:bg-slate-700/50'
                }`}
              >
                <span className="material-symbols-outlined text-base">{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {'badge' in item && item.badge && (
                  <span className={`text-xs ${item.badge.color}`}>
                    {item.badge.label === 'Safe to delete' && '✓'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && fileInfo && (
        <DeleteConfirmDialog
          fileInfo={fileInfo}
          onConfirm={() => performDelete()}
          onCancel={() => setShowConfirmDialog(false)}
          isDeleting={isDeleting}
        />
      )}
    </>
  );
};

export default ContextMenu;
