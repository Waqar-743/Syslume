// Type definitions matching the Rust backend

export type NodeId = number;

export interface ScanOptions {
  follow_symlinks?: boolean;
  one_file_system?: boolean;
  max_depth?: number | null;
  exclude_patterns?: string[];
}

export type NodeKind = "file" | "dir";

export interface TreeNode {
  id: NodeId;
  parent: NodeId | null;
  name: string;
  path: string;
  kind: NodeKind;
  size_bytes: number;
  file_ext: string | null;
  children: NodeId[];
}

export interface TreeNodeDelta {
  id: NodeId;
  parent: NodeId | null;
  name: string;
  path: string;
  kind: NodeKind;
  size_bytes: number;
  file_ext: string | null;
}

export interface ExtensionStat {
  ext: string;
  bytes: number;
  count: number;
}

export interface ScanResult {
  scan_id: string;
  root_id: NodeId;
  total_bytes: number;
  total_files: number;
  total_dirs: number;
  extension_stats: ExtensionStat[];
}

export interface ScanSummary {
  total_bytes: number;
  total_files: number;
  total_dirs: number;
  extension_stats: ExtensionStat[];
}

export interface ScanHandle {
  scan_id: string;
}

export interface RootEntry {
  name: string;
  path: string;
  total_bytes: number;
  available_bytes: number;
}

// Event payloads
export interface StartedPayload {
  scan_id: string;
  root_path: string;
  started_at: number;
}

export interface ProgressPayload {
  scan_id: string;
  visited_entries: number;
  visited_bytes_approx: number;
  current_path: string;
  phase: string;
}

export interface PartialTreePayload {
  scan_id: string;
  nodes: TreeNodeDelta[];
  updated_at: number;
}

export interface FinishedPayload {
  scan_id: string;
  summary: ScanSummary;
  root_node_id: NodeId;
  finished_at: number;
}

export interface ErrorPayload {
  scan_id: string;
  message: string;
  path: string | null;
}

export interface CanceledPayload {
  scan_id: string;
}

// App-specific types
export type AppView = 'HOME' | 'SCANNING' | 'DASHBOARD' | 'SETTINGS' | 'FILTERED';

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  showEmptyFolders: boolean;
  followSymbolicLinks: boolean;
  highPrecisionSizes: boolean;
  scanThreads: number;
  maxDepth: number;
  includeHidden: boolean;
  includeSystemDirs: boolean;
}

export interface ScanProgressPayload {
  scan_id?: string;
  visited_entries: number;
  visited_bytes_approx: number;
  current_path: string;
  phase: string;
  elapsed_ms?: number;
}

export interface RecentScan {
  id: string;
  path: string;
  size: string;
  time: string;
  icon: string;
}

export interface TopFile {
  id: string;
  name: string;
  size: string;
  path: string;
  date: string;
  icon: string;
}

// ==========================================
// SMART DELETE TYPES
// ==========================================

export type SafetyLevel = 'AutoDelete' | 'ConfirmRequired' | 'Protected';

export interface DeleteResult {
  success: boolean;
  bytes_freed: number;
  files_deleted: number;
  folders_deleted: number;
  errors: string[];
  was_auto_delete: boolean;
}

export interface FileInfo {
  path: string;
  name: string;
  size_bytes: number;
  safety_level: SafetyLevel;
  is_dir: boolean;
  modified_days_ago?: number | null;
  extension?: string | null;
  size?: number;
}

export interface DeletedPayload {
  path: string;
  bytes_freed: number;
  was_auto: boolean;
}

export interface DeleteFailedPayload {
  path: string;
  reason: string;
}

