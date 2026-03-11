import React, { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DeleteResult, FileInfo } from '../types';
import { isLikelyProtectedPath } from '../utils';
import DeleteConfirmDialog from './DeleteConfirmDialog';

interface SmartDeleteButtonProps {
  path: string;
  name: string;
  className?: string;
  title?: string;
  onDeleted?: (result: DeleteResult) => void;
  onError?: (message: string) => void;
}

const SmartDeleteButton: React.FC<SmartDeleteButtonProps> = ({
  path,
  name,
  className = '',
  title = 'Delete file',
  onDeleted,
  onError,
}) => {
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isProtected = useMemo(() => isLikelyProtectedPath(path), [path]);

  if (isProtected) {
    return null;
  }

  const loadFileInfo = async () => {
    if (fileInfo) {
      return fileInfo;
    }

    setIsLoading(true);
    try {
      const info = await invoke<FileInfo>('get_file_details', { path });
      setFileInfo(info);
      return info;
    } catch (err) {
      const fallback: FileInfo = {
        path,
        name,
        size_bytes: 0,
        safety_level: 'ConfirmRequired',
        is_dir: false,
        extension: null,
        modified_days_ago: null,
      };
      setFileInfo(fallback);
      return fallback;
    } finally {
      setIsLoading(false);
    }
  };

  const performDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await invoke<DeleteResult>('smart_delete', {
        path,
        force: true,
      });

      if (!result.success) {
        throw new Error(result.errors.join(', ') || 'Delete failed');
      }

      onDeleted?.(result);
      setShowConfirm(false);
    } catch (err) {
      onError?.(String(err));
      setShowConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = async () => {
    const info = await loadFileInfo();

    if (info.safety_level === 'Protected') {
      onError?.('Protected system files cannot be deleted');
      return;
    }

    if (info.safety_level === 'AutoDelete') {
      await performDelete();
      return;
    }

    setShowConfirm(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting || isLoading}
        title={title}
        aria-label={title}
        className={className}
      >
        <span className={`material-symbols-outlined ${isDeleting || isLoading ? 'animate-spin' : ''}`}>
          {isDeleting || isLoading ? 'refresh' : 'delete'}
        </span>
      </button>

      {showConfirm && fileInfo && (
        <DeleteConfirmDialog
          fileInfo={fileInfo}
          onConfirm={performDelete}
          onCancel={() => setShowConfirm(false)}
          isDeleting={isDeleting}
        />
      )}
    </>
  );
};

export default SmartDeleteButton;