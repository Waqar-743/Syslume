import React, { useEffect, useRef } from 'react';
import type { FileInfo, SafetyLevel } from '../types';
import { FORMAT_SIZE } from '../constants';

interface DeleteConfirmDialogProps {
  fileInfo: FileInfo;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

const SAFETY_CONFIG: Record<SafetyLevel, { color: string; icon: string; label: string; description: string }> = {
  AutoDelete: {
    color: 'text-green-400',
    icon: 'check_circle',
    label: 'Safe to Delete',
    description: 'This is a temporary/cache file that can be safely deleted.',
  },
  ConfirmRequired: {
    color: 'text-amber-400',
    icon: 'warning',
    label: 'Confirm Required',
    description: 'This file may contain important data. Please confirm deletion.',
  },
  Protected: {
    color: 'text-red-400',
    icon: 'shield',
    label: 'Protected',
    description: 'This is a system file that cannot be deleted.',
  },
};

const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  fileInfo,
  onConfirm,
  onCancel,
  isDeleting,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const config = SAFETY_CONFIG[fileInfo.safety_level];

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onCancel();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node) && !isDeleting) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onCancel, isDeleting]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        ref={dialogRef}
        className="w-full max-w-md bg-slate-800 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/80">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl bg-slate-700/50 ${config.color}`}>
              <span className="material-symbols-outlined text-2xl">{config.icon}</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{config.label}</h3>
              <p className="text-sm text-slate-400">{config.description}</p>
            </div>
          </div>
        </div>

        {/* File Info */}
        <div className="px-6 py-4 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-700/30">
            <span className={`material-symbols-outlined text-2xl ${fileInfo.is_dir ? 'text-amber-400' : 'text-cyan-400'}`}>
              {fileInfo.is_dir ? 'folder' : 'draft'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{fileInfo.name}</div>
              <div className="text-xs text-slate-400 truncate">{fileInfo.path}</div>
            </div>
          </div>

          {/* File Details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded-xl bg-slate-700/30">
              <div className="text-slate-400 text-xs mb-1">Size</div>
              <div className="text-white font-medium">{FORMAT_SIZE(fileInfo.size_bytes ?? fileInfo.size ?? 0)}</div>
            </div>
            {fileInfo.extension && (
              <div className="p-3 rounded-xl bg-slate-700/30">
                <div className="text-slate-400 text-xs mb-1">Type</div>
                <div className="text-white font-medium uppercase">{fileInfo.extension}</div>
              </div>
            )}
            {fileInfo.modified_days_ago !== null && (
              <div className="p-3 rounded-xl bg-slate-700/30">
                <div className="text-slate-400 text-xs mb-1">Last Modified</div>
                <div className="text-white font-medium">
                  {fileInfo.modified_days_ago === 0 
                    ? 'Today' 
                    : fileInfo.modified_days_ago === 1 
                      ? 'Yesterday' 
                      : `${fileInfo.modified_days_ago} days ago`}
                </div>
              </div>
            )}
          </div>

          {/* Warning for important files */}
          {fileInfo.safety_level === 'ConfirmRequired' && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <span className="material-symbols-outlined text-amber-400 mt-0.5">info</span>
              <div className="text-sm text-amber-200">
                <strong>Note:</strong> This file will be moved to the Recycle Bin. 
                You can restore it from there if needed.
              </div>
            </div>
          )}

          {/* Protected warning */}
          {fileInfo.safety_level === 'Protected' && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <span className="material-symbols-outlined text-red-400 mt-0.5">block</span>
              <div className="text-sm text-red-200">
                <strong>Cannot delete:</strong> This is a protected system file 
                that is required for your computer to function properly.
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-slate-700/50 bg-slate-800/50 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          {fileInfo.safety_level !== 'Protected' && (
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isDeleting ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-base">refresh</span>
                  Deleting...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">delete</span>
                  Delete
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmDialog;
