/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.min(i, sizes.length - 1);

  return parseFloat((bytes / Math.pow(k, index)).toFixed(dm)) + " " + sizes[index];
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Calculate percentage
 */
export function percentage(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

/**
 * Get color for file extension
 */
export function getExtensionColor(ext: string): string {
  const colors: Record<string, string> = {
    // Documents
    pdf: "#455e3f",
    doc: "#b1a17e",
    docx: "#b1a17e",
    xls: "#6e8254",
    xlsx: "#6e8254",
    ppt: "#6e8254",
    pptx: "#6e8254",
    txt: "#6e8254",
    
    // Images
    jpg: "#6e8254",
    jpeg: "#6e8254",
    png: "#8f8b7c",
    gif: "#455e3f",
    svg: "#6e8254",
    webp: "#6e8254",
    bmp: "#6e8254",
    
    // Videos
    mp4: "#455e3f",
    mkv: "#a58b4b",
    avi: "#455e3f",
    mov: "#455e3f",
    wmv: "#455e3f",
    
    // Audio
    mp3: "#b1a17e",
    wav: "#b1a17e",
    flac: "#455e3f",
    aac: "#b1a17e",
    
    // Archives
    zip: "#8f8b7c",
    rar: "#6e8254",
    "7z": "#6e8254",
    tar: "#455e3f",
    gz: "#455e3f",
    
    // Code
    js: "#8f8b7c",
    ts: "#b1a17e",
    jsx: "#8f8b7c",
    tsx: "#8f8b7c",
    py: "#8f8b7c",
    rs: "#6e8254",
    go: "#879276",
    java: "#b1a17e",
    cpp: "#8f8b7c",
    c: "#b1a17e",
    html: "#879276",
    css: "#455e3f",
    json: "#b1a17e",
    
    // Executables
    exe: "#6e8254",
    dll: "#6e8254",
    msi: "#6e8254",
    
    // System
    sys: "#b1a17e",
    log: "#6e8254",
    ini: "#a58b4b",
    cfg: "#a58b4b",
    
    // Default
    "<none>": "#879276",
  };
  
  return colors[ext.toLowerCase()] || "#879276";
}

/**
 * Truncate path for display
 */
export function truncatePath(path: string, maxLength = 50): string {
  if (path.length <= maxLength) return path;
  
  const parts = path.split(/[/\\]/);
  if (parts.length <= 3) return path;
  
  const start = parts.slice(0, 2).join("/");
  const end = parts.slice(-1)[0];
  
  return `${start}/.../${end}`;
}

const PROTECTED_PATH_SEGMENTS = [
  'windows',
  'system32',
  'syswow64',
  'program files',
  'program files (x86)',
  'programdata',
  'users',
  'documents',
  'pictures',
  'videos',
  'music',
  'downloads',
  'desktop',
  'appdata',
  'boot',
  'recovery',
  'system volume information',
];

export function isLikelyProtectedPath(path: string): boolean {
  const parts = path
    .toLowerCase()
    .split(/[/\\]/)
    .filter(Boolean);

  return PROTECTED_PATH_SEGMENTS.some((segment) => {
    if (!parts.includes(segment)) {
      return false;
    }

    return parts.length <= 3 || parts.indexOf(segment) <= 2;
  });
}
