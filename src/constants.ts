import type { AppSettings } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  maxDepth: 48,
  includeHidden: false,
  includeSystemDirs: false,
  followSymbolicLinks: false,
  oneFileSystem: true,
  excludePatterns: [],
  duplicateMinSizeMb: 10,
  oldFileDays: 180,
};

export const FORMAT_SIZE = (bytes: number, precision = 1): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : precision)} ${units[index]}`;
};

export const SETTINGS_KEY = "syslume.settings.v2";
export const HISTORY_KEY = "syslume.history.v2";
