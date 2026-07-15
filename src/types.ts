export type NodeId = number;

export interface ScanOptions {
  follow_symlinks?: boolean;
  one_file_system?: boolean;
  max_depth?: number | null;
  exclude_patterns?: string[];
  include_hidden?: boolean;
  include_system_dirs?: boolean;
}

export type NodeKind = "file" | "dir";

export interface TreeNodeDelta {
  id: NodeId;
  parent: NodeId | null;
  name: string;
  path: string;
  kind: NodeKind;
  size_bytes: number;
  file_ext: string | null;
  modified_unix?: number | null;
  created_unix?: number | null;
  readonly?: boolean;
  is_symlink?: boolean;
}

export interface TreeNode extends TreeNodeDelta {
  children: NodeId[];
}

export interface ExtensionStat {
  ext: string;
  bytes: number;
  count: number;
}

export interface ScanSummary {
  total_bytes: number;
  total_files: number;
  total_dirs: number;
  extension_stats: ExtensionStat[];
}

export interface ScanResult extends ScanSummary {
  scan_id: string;
  root_id: NodeId;
}

export interface ScanHandle { scan_id: string; }

export interface RootEntry {
  name: string;
  path: string;
  total_bytes: number;
  available_bytes: number;
}

export interface ProgressPayload {
  scan_id: string;
  visited_entries: number;
  visited_bytes_approx: number;
  current_path: string;
  phase: string;
}

export interface FinishedPayload {
  scan_id: string;
  summary: ScanSummary;
  root_node_id: NodeId;
  finished_at: number;
}

export interface TreeNodeDeltaPayload {
  scan_id: string;
  nodes: TreeNodeDelta[];
  updated_at: number;
}

export interface ScanProgressPayload extends ProgressPayload {
  elapsed_ms?: number;
}

export type AppView = "HOME" | "SCANNING" | "DASHBOARD";

export interface AppSettings {
  theme: "dark" | "light" | "system";
  maxDepth: number;
  includeHidden: boolean;
  includeSystemDirs: boolean;
  followSymbolicLinks: boolean;
  oneFileSystem: boolean;
  excludePatterns: string[];
  duplicateMinSizeMb: number;
  oldFileDays: number;
}

export interface ScanHistoryEntry {
  id: string;
  path: string;
  name: string;
  scannedAt: number;
  durationMs: number;
  summary: ScanSummary;
}

// Rust serializes the canonical values in snake_case. PascalCase variants are
// retained temporarily so legacy components remain source-compatible.
export type SafetyLevel =
  | "auto_delete" | "confirm_required" | "protected"
  | "AutoDelete" | "ConfirmRequired" | "Protected";

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

export interface DuplicateFile { path: string; size_bytes: number; }

export interface DuplicateGroup {
  hash: string;
  size_bytes: number;
  reclaimable_bytes: number;
  files: DuplicateFile[];
}

export interface RecentScan { id: string; path: string; size: string; time: string; icon: string; }
export interface TopFile { id: string; name: string; size: string; path: string; date: string; icon: string; }
export interface DeletedPayload { path: string; bytes_freed: number; was_auto: boolean; }
export interface DeleteFailedPayload { path: string; reason: string; }
