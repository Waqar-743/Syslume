use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};

// ==========================================
// SAFETY LEVEL CLASSIFICATION
// ==========================================

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SafetyLevel {
    AutoDelete,      // No warning - safe to delete
    ConfirmRequired, // Show warning dialog
    Protected,       // Never delete (system files)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeleteResult {
    pub success: bool,
    pub bytes_freed: u64,
    pub files_deleted: u64,
    pub folders_deleted: u64,
    pub errors: Vec<String>,
    pub was_auto_delete: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub safety_level: SafetyLevel,
    pub is_dir: bool,
}

// Auto-delete extensions (safe to delete without confirmation)
const AUTO_DELETE_EXTENSIONS: &[&str] = &[
    // Temp files
    "tmp",
    "temp",
    "bak",
    "old",
    "swp",
    "swo",
    // Logs
    "log",
    "logs",
    // Cache
    "cache",
    // Windows junk
    "thumbs.db",
    "desktop.ini",
    "ehthumbs.db",
    "ehthumbs_vista.db",
    // macOS junk
    "ds_store",
    // Thumbnails
    "thumb",
    "thumbcache",
    // Build artifacts
    "pdb",
    "ilk",
    "obj",
    "o",
    "a",
    "lib",
    "exp",
    // Package lock files (usually regenerated)
    "pyc",
    "pyo",
    "__pycache__",
    // Editor backups
    "bak~",
    "~",
];

// Auto-delete file names (exact match, case-insensitive)
const AUTO_DELETE_NAMES: &[&str] = &[
    "thumbs.db",
    "desktop.ini",
    "ehthumbs.db",
    "ehthumbs_vista.db",
    ".ds_store",
    "npm-debug.log",
    "yarn-error.log",
    "yarn-debug.log",
    "debug.log",
    "error.log",
    "access.log",
];

// Auto-delete folder names (these folders are safe to delete)
const AUTO_DELETE_FOLDERS: &[&str] = &[
    // Caches
    ".cache",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    "node_modules",
    ".npm",
    ".yarn",
    ".pnpm",
    // Build outputs
    "dist",
    "build",
    "out",
    "target",
    ".next",
    ".nuxt",
    ".turbo",
    // IDE/Editor
    ".vs",
    // Temp
    "tmp",
    "temp",
    ".tmp",
    ".temp",
    // Logs
    "logs",
    "log",
];

// Protected paths (NEVER delete)
const PROTECTED_PATHS: &[&str] = &[
    "windows",
    "system32",
    "syswow64",
    "program files",
    "program files (x86)",
    "programdata",
    "users",
    "documents",
    "pictures",
    "videos",
    "music",
    "downloads",
    "desktop",
    "appdata",
    "boot",
    "recovery",
    "system volume information",
];

// Any descendant of these operating-system locations remains protected.
const ALWAYS_PROTECTED_SEGMENTS: &[&str] = &[
    "windows",
    "system32",
    "syswow64",
    "program files",
    "program files (x86)",
    "programdata",
    "boot",
    "recovery",
    "system volume information",
];

// Important/protected extensions (require confirmation)
const IMPORTANT_EXTENSIONS: &[&str] = &[
    // Documents
    "doc", "docx", "pdf", "txt", "rtf", "odt", "xls", "xlsx", "ppt", "pptx", // Media
    "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "mp3", "wav", "flac", "aac", "ogg", "m4a",
    "wma", "jpg", "jpeg", "png", "gif", "bmp", "svg", "webp", "ico", "tiff", "raw",
    // Code
    "js", "ts", "jsx", "tsx", "py", "rs", "go", "java", "cpp", "c", "cs", "rb", "php", "swift",
    "kt", "html", "css", "scss", "sass", "less", // Config
    "json", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", // Archives
    "zip", "rar", "7z", "tar", "gz", "bz2", "xz", // Databases
    "db", "sqlite", "sql", "mdb", // Executables
    "exe", "msi", "app", "dmg", "deb", "rpm",
];

/// Get the safety level for a file or folder
pub fn get_safety_level(path: &Path) -> SafetyLevel {
    if path.parent().is_none() {
        return SafetyLevel::Protected;
    }
    let path_str = path.to_string_lossy().to_lowercase();
    let parts: Vec<&str> = path_str
        .split(['/', '\\'])
        .filter(|part| !part.is_empty())
        .collect();

    if parts
        .iter()
        .any(|part| ALWAYS_PROTECTED_SEGMENTS.contains(part))
    {
        return SafetyLevel::Protected;
    }

    // Check if path is protected
    for protected in PROTECTED_PATHS {
        if path_str.contains(protected) {
            // Check if it's a direct system path
            if parts.len() <= 3 && parts.iter().any(|p| p == protected) {
                return SafetyLevel::Protected;
            }
        }
    }

    // Check file name
    if let Some(name) = path.file_name() {
        let name_lower = name.to_string_lossy().to_lowercase();

        // Check auto-delete names
        for auto_name in AUTO_DELETE_NAMES {
            if name_lower == *auto_name {
                return SafetyLevel::AutoDelete;
            }
        }

        // Check if it's a folder
        if path.is_dir() {
            for auto_folder in AUTO_DELETE_FOLDERS {
                if name_lower == *auto_folder {
                    return SafetyLevel::AutoDelete;
                }
            }
        }
    }

    // Check extension
    if let Some(ext) = path.extension() {
        let ext_lower = ext.to_string_lossy().to_lowercase();

        // Check auto-delete extensions
        for auto_ext in AUTO_DELETE_EXTENSIONS {
            if ext_lower == *auto_ext {
                return SafetyLevel::AutoDelete;
            }
        }

        // Check important extensions
        for imp_ext in IMPORTANT_EXTENSIONS {
            if ext_lower == *imp_ext {
                return SafetyLevel::ConfirmRequired;
            }
        }
    }

    // Check file age and size for heuristic (old large files more likely junk)
    if let Ok(metadata) = path.metadata() {
        if let Ok(modified) = metadata.modified() {
            if let Ok(age) = SystemTime::now().duration_since(modified) {
                let size = metadata.len();
                // Files > 100MB and older than 30 days
                if size > 100 * 1024 * 1024 && age > Duration::from_secs(30 * 24 * 60 * 60) {
                    // Still require confirmation for unknown types
                    return SafetyLevel::ConfirmRequired;
                }
            }
        }
    }

    // Default: require confirmation for unknown types
    SafetyLevel::ConfirmRequired
}

/// Get file info with safety level
pub fn get_file_info(path: &Path) -> Result<FileInfo, String> {
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    let metadata = path.metadata().map_err(|e| e.to_string())?;
    let size = if path.is_dir() {
        calculate_dir_size(path).unwrap_or(0)
    } else {
        metadata.len()
    };

    Ok(FileInfo {
        path: path.to_string_lossy().to_string(),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string()),
        size_bytes: size,
        safety_level: get_safety_level(path),
        is_dir: path.is_dir(),
    })
}

/// Calculate directory size recursively
fn calculate_dir_size(path: &Path) -> Result<u64, std::io::Error> {
    let mut size = 0;
    if path.is_dir() {
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path)?;
            #[cfg(windows)]
            let link = { use std::os::windows::fs::MetadataExt; metadata.file_attributes() & 0x400 != 0 };
            #[cfg(not(windows))]
            let link = metadata.file_type().is_symlink();
            if metadata.is_dir() && !link {
                size += calculate_dir_size(&path).unwrap_or(0);
            } else {
                size += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    Ok(size)
}

/// Delete a file with smart safety checks
pub fn smart_delete_file(path: &Path, force: bool) -> Result<DeleteResult, String> {
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    let safety_level = get_safety_level(path);

    // Never delete protected files
    if safety_level == SafetyLevel::Protected || get_safety_level(&canonical) == SafetyLevel::Protected {
        return Err("Cannot delete protected system file".to_string());
    }

    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    { use std::os::windows::fs::MetadataExt;
      if metadata.file_attributes() & 0x400 != 0 { return Err("Links and reparse points cannot be cleaned by Syslume.".into()); }
    }
    #[cfg(not(windows))]
    if metadata.file_type().is_symlink() { return Err("Links cannot be cleaned by Syslume.".into()); }

    // Check if confirmation is required
    if safety_level == SafetyLevel::ConfirmRequired && !force {
        return Err("This item requires explicit cleanup confirmation.".into());
    }
    let was_auto_delete = safety_level == SafetyLevel::AutoDelete;

    let size = if path.is_file() {
        path.metadata().map(|m| m.len()).unwrap_or(0)
    } else {
        calculate_dir_size(path).unwrap_or(0)
    };

    // Perform deletion
    let result = if path.is_dir() {
        delete_folder_recursive_internal(path)
    } else {
        delete_single_file(path)
    };

    match result {
        Ok((files, folders)) => Ok(DeleteResult {
            success: true,
            bytes_freed: size,
            files_deleted: files,
            folders_deleted: folders,
            errors: vec![],
            was_auto_delete,
        }),
        Err(e) => Ok(DeleteResult {
            success: false,
            bytes_freed: 0,
            files_deleted: 0,
            folders_deleted: 0,
            errors: vec![e],
            was_auto_delete,
        }),
    }
}

/// Delete a single file
fn delete_single_file(path: &Path) -> Result<(u64, u64), String> {
    trash::delete(path).map_err(|error| format!("Could not move item to trash: {error}"))?;
    Ok((1, 0))
}

/// Delete a folder recursively
fn delete_folder_recursive_internal(path: &Path) -> Result<(u64, u64), String> {
    trash::delete(path).map_err(|error| format!("Could not move folder to trash: {error}"))?;
    Ok((0, 1))
}

/// Bulk delete multiple paths
pub fn bulk_delete(paths: Vec<&Path>, skip_confirm: bool) -> DeleteResult {
    let mut total_bytes = 0u64;
    let mut total_files = 0u64;
    let mut total_folders = 0u64;
    let mut errors = Vec::new();
    let mut all_auto = true;

    for path in paths {
        let safety = get_safety_level(path);

        if safety == SafetyLevel::Protected {
            errors.push(format!("Skipped protected: {}", path.display()));
            continue;
        }

        if safety == SafetyLevel::ConfirmRequired && !skip_confirm {
            errors.push(format!("Requires confirmation: {}", path.display()));
            all_auto = false;
            continue;
        }

        if safety == SafetyLevel::ConfirmRequired {
            all_auto = false;
        }

        match smart_delete_file(path, false) {
            Ok(result) => {
                total_bytes += result.bytes_freed;
                total_files += result.files_deleted;
                total_folders += result.folders_deleted;
                errors.extend(result.errors);
            }
            Err(e) => {
                errors.push(e);
            }
        }
    }

    DeleteResult {
        success: errors.is_empty(),
        bytes_freed: total_bytes,
        files_deleted: total_files,
        folders_deleted: total_folders,
        errors,
        was_auto_delete: all_auto,
    }
}

// ==========================================
// DELETE EVENTS
// ==========================================

#[derive(Clone, Debug, Serialize)]
pub struct DeletedPayload {
    pub path: String,
    pub bytes_freed: u64,
    pub was_auto: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct DeleteFailedPayload {
    pub path: String,
    pub reason: String,
}

pub fn emit_deleted(app_handle: &AppHandle, payload: DeletedPayload) {
    let _ = app_handle.emit("delete://deleted", payload);
}

pub fn emit_delete_failed(app_handle: &AppHandle, payload: DeleteFailedPayload) {
    let _ = app_handle.emit("delete://failed", payload);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn confirmation_and_protected_paths_cannot_be_bypassed() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("important.data");
        fs::write(&file, b"keep me").unwrap();
        assert!(smart_delete_file(&file, false).is_err());
        assert!(file.exists());
        #[cfg(windows)]
        assert!(smart_delete_file(Path::new("C:/Windows"), true).is_err());
    }
}
