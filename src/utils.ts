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
    pdf: "#e74c3c",
    doc: "#2980b9",
    docx: "#2980b9",
    xls: "#27ae60",
    xlsx: "#27ae60",
    ppt: "#e67e22",
    pptx: "#e67e22",
    txt: "#95a5a6",
    
    // Images
    jpg: "#9b59b6",
    jpeg: "#9b59b6",
    png: "#8e44ad",
    gif: "#1abc9c",
    svg: "#f39c12",
    webp: "#9b59b6",
    bmp: "#9b59b6",
    
    // Videos
    mp4: "#e74c3c",
    mkv: "#c0392b",
    avi: "#e74c3c",
    mov: "#e74c3c",
    wmv: "#e74c3c",
    
    // Audio
    mp3: "#3498db",
    wav: "#2980b9",
    flac: "#1abc9c",
    aac: "#3498db",
    
    // Archives
    zip: "#f1c40f",
    rar: "#f39c12",
    "7z": "#e67e22",
    tar: "#d35400",
    gz: "#d35400",
    
    // Code
    js: "#f1c40f",
    ts: "#3498db",
    jsx: "#61dafb",
    tsx: "#61dafb",
    py: "#3776ab",
    rs: "#dea584",
    go: "#00add8",
    java: "#b07219",
    cpp: "#f34b7d",
    c: "#555555",
    html: "#e34c26",
    css: "#563d7c",
    json: "#292929",
    
    // Executables
    exe: "#2c3e50",
    dll: "#34495e",
    msi: "#2c3e50",
    
    // System
    sys: "#7f8c8d",
    log: "#95a5a6",
    ini: "#bdc3c7",
    cfg: "#bdc3c7",
    
    // Default
    "<none>": "#636e72",
  };
  
  return colors[ext.toLowerCase()] || "#636e72";
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
