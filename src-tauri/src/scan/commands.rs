use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use ignore::WalkBuilder;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State, Emitter};
use uuid::Uuid;

use crate::scan::delete::{
    emit_delete_failed, emit_deleted, get_file_info, get_safety_level, smart_delete_file,
    DeleteFailedPayload, DeleteResult, DeletedPayload, FileInfo, SafetyLevel,
};
use crate::scan::engine::{run_scan, ScanError};
use crate::scan::events::{
    emit_canceled, emit_error, emit_finished, emit_started, CanceledPayload, ErrorPayload,
    FinishedPayload, StartedPayload,
};
use crate::scan::model::{RootEntry, ScanHandle, ScanOptions, ScanSummary};
use crate::scan::state::{AppState, ScanState};

#[tauri::command]
pub fn start_scan(
    root_path: String,
    options: ScanOptions,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<ScanHandle, String> {
    let root_path = crate::scan::engine::normalize_root(&root_path)?.to_string_lossy().to_string();
    let scan_id = Uuid::new_v4().to_string();
    let scan_state = ScanState::new();
    let started_at = scan_state
        .started_at
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    state.insert_scan(scan_id.clone(), scan_state);
    let state_clone = state.inner().clone();
    let app_handle_clone = app_handle.clone();
    let root_path_clone = root_path.clone();
    let options_clone = options.clone();

    emit_started(
        &app_handle,
        StartedPayload {
            scan_id: scan_id.clone(),
            root_path: root_path.clone(),
            started_at,
        },
    );

    let scan_id_for_closure = scan_id.clone();
    thread::spawn(move || {
        let cancel_flag = match state_clone.get_cancel_flag(&scan_id_for_closure) {
            Some(flag) => flag,
            None => return,
        };

        let result = run_scan(
            Some(app_handle_clone.clone()),
            scan_id_for_closure.clone(),
            root_path_clone.clone(),
            options_clone,
            cancel_flag,
        );

        match result {
            Ok(result) => {
                let summary = ScanSummary {
                    total_bytes: result.total_bytes,
                    total_files: result.total_files,
                    total_dirs: result.total_dirs,
                    extension_stats: result.extension_stats.clone(),
                };
                let result_scan_id = result.scan_id.clone();
                emit_finished(
                    &app_handle_clone,
                    FinishedPayload {
                        scan_id: result_scan_id.clone(),
                        summary,
                        root_node_id: result.root_id,
                        finished_at: now_millis(),
                    },
                );
                state_clone.finish_scan(&result_scan_id, result);
            }
            Err(ScanError::Canceled) => {
                emit_canceled(
                    &app_handle_clone,
                    CanceledPayload {
                        scan_id: scan_id_for_closure.clone(),
                    },
                );
                state_clone.remove_scan(&scan_id_for_closure);
            }
            Err(ScanError::Failed(message)) => {
                let _ = app_handle_clone.emit("scan://failed", ErrorPayload {
                    scan_id: scan_id_for_closure.clone(), message: message.clone(), path: Some(root_path_clone.clone()),
                });
                emit_error(
                    &app_handle_clone,
                    ErrorPayload {
                        scan_id: scan_id_for_closure.clone(),
                        message,
                        path: Some(root_path_clone),
                    },
                );
                state_clone.remove_scan(&scan_id_for_closure);
            }
        }
    });

    Ok(ScanHandle { scan_id })
}

#[tauri::command]
pub fn cancel_scan(scan_id: String, state: State<'_, AppState>) -> bool {
    state.cancel_scan(&scan_id)
}

#[tauri::command]
pub fn get_scan_result(
    scan_id: String,
    state: State<'_, AppState>,
) -> Option<crate::scan::model::ScanResult> {
    state.get_result(&scan_id)
}

#[tauri::command]
pub fn list_roots() -> Vec<RootEntry> {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    disks
        .list()
        .iter()
        .map(|disk| RootEntry {
            name: disk.name().to_string_lossy().to_string(),
            path: disk.mount_point().to_string_lossy().to_string(),
            total_bytes: disk.total_space(),
            available_bytes: disk.available_space(),
        })
        .collect()
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Open a file or folder in the system file explorer
#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<(), String> {
    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        if path.is_dir() {
            Command::new("explorer")
                .arg(path)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("explorer")
                .args(["/select,", &path.to_string_lossy()])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        if path.is_dir() {
            Command::new("open")
                .arg(path)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("open")
                .args(["-R", &path.to_string_lossy()])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let parent = path.parent().unwrap_or(path);
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Delete a file or folder
#[tauri::command]
pub fn delete_path(path: String, to_trash: bool) -> Result<(), String> {
    if !to_trash { return Err("Syslume only moves reviewed items to the Recycle Bin. Permanent deletion is disabled.".into()); }
    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if get_safety_level(path) == SafetyLevel::Protected || get_safety_level(&canonical) == SafetyLevel::Protected {
        return Err("Cannot delete a protected system path".to_string());
    }

    trash::delete(path).map_err(|e| e.to_string())?;

    Ok(())
}

/// Get file/folder size
#[tauri::command]
pub fn get_path_size(path: String) -> Result<u64, String> {
    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if path.is_file() {
        return path.metadata().map(|m| m.len()).map_err(|e| e.to_string());
    }

    // For directories, calculate recursively
    fn dir_size(path: &Path) -> Result<u64, std::io::Error> {
        let mut size = 0;
        if path.is_dir() {
            for entry in fs::read_dir(path)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    size += dir_size(&path)?;
                } else {
                    size += entry.metadata()?.len();
                }
            }
        }
        Ok(size)
    }

    dir_size(path).map_err(|e| e.to_string())
}

// ==========================================
// SMART DELETE COMMANDS
// ==========================================

/// Get the safety level for a file or folder
#[tauri::command]
pub fn get_file_safety_level(path: String) -> Result<SafetyLevel, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }
    Ok(get_safety_level(path))
}

/// Get detailed file info including safety level
#[tauri::command]
pub fn get_file_details(path: String) -> Result<FileInfo, String> {
    let path = Path::new(&path);
    get_file_info(path)
}

/// Smart delete a file or folder
/// If force=true, skip confirmation requirement (user already confirmed)
#[tauri::command]
pub fn smart_delete(
    path: String,
    force: bool,
    app_handle: AppHandle,
) -> Result<DeleteResult, String> {
    let path_obj = Path::new(&path);

    if !path_obj.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let safety = get_safety_level(path_obj);

    // Never allow deleting protected files
    if safety == SafetyLevel::Protected {
        emit_delete_failed(
            &app_handle,
            DeleteFailedPayload {
                path: path.clone(),
                reason: "Protected system file cannot be deleted".to_string(),
            },
        );
        return Err("Cannot delete protected system file".to_string());
    }

    // If confirmation required but not forced, return error
    if safety == SafetyLevel::ConfirmRequired && !force {
        return Err("Confirmation required for this file type".to_string());
    }

    // Perform the delete
    match smart_delete_file(path_obj, force) {
        Ok(result) => {
            if result.success {
                emit_deleted(
                    &app_handle,
                    DeletedPayload {
                        path: path.clone(),
                        bytes_freed: result.bytes_freed,
                        was_auto: result.was_auto_delete,
                    },
                );
            } else {
                for error in &result.errors {
                    emit_delete_failed(
                        &app_handle,
                        DeleteFailedPayload {
                            path: path.clone(),
                            reason: error.clone(),
                        },
                    );
                }
            }
            Ok(result)
        }
        Err(e) => {
            emit_delete_failed(
                &app_handle,
                DeleteFailedPayload {
                    path: path.clone(),
                    reason: e.clone(),
                },
            );
            Err(e)
        }
    }
}

/// Bulk delete multiple paths with smart safety checks
#[tauri::command]
pub async fn bulk_smart_delete(paths: Vec<String>, force: bool, app_handle: AppHandle) -> Result<DeleteResult, String> {
    tauri::async_runtime::spawn_blocking(move || bulk_smart_delete_inner(paths, force, app_handle))
        .await.map_err(|error| error.to_string())
}

fn bulk_smart_delete_inner(paths: Vec<String>, force: bool, app_handle: AppHandle) -> DeleteResult {
    let mut total_bytes = 0u64;
    let mut total_files = 0u64;
    let mut total_folders = 0u64;
    let mut errors = Vec::new();
    let mut all_auto = true;

    for path_str in paths {
        let path = Path::new(&path_str);

        if !path.exists() {
            errors.push(format!("Path does not exist: {}", path_str));
            continue;
        }

        let safety = get_safety_level(path);

        if safety == SafetyLevel::Protected {
            errors.push(format!("Skipped protected: {}", path_str));
            emit_delete_failed(
                &app_handle,
                DeleteFailedPayload {
                    path: path_str.clone(),
                    reason: "Protected system file".to_string(),
                },
            );
            continue;
        }

        if safety == SafetyLevel::ConfirmRequired && !force {
            errors.push(format!("Requires confirmation: {}", path_str));
            all_auto = false;
            continue;
        }

        if safety == SafetyLevel::ConfirmRequired {
            all_auto = false;
        }

        match smart_delete_file(path, force) {
            Ok(result) => {
                total_bytes += result.bytes_freed;
                total_files += result.files_deleted;
                total_folders += result.folders_deleted;
                errors.extend(result.errors);

                if result.success {
                    emit_deleted(
                        &app_handle,
                        DeletedPayload {
                            path: path_str,
                            bytes_freed: result.bytes_freed,
                            was_auto: result.was_auto_delete,
                        },
                    );
                }
            }
            Err(e) => {
                errors.push(e.clone());
                emit_delete_failed(
                    &app_handle,
                    DeleteFailedPayload {
                        path: path_str,
                        reason: e,
                    },
                );
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

#[derive(Clone, Debug, Serialize)]
pub struct DuplicateFile {
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size_bytes: u64,
    pub reclaimable_bytes: u64,
    pub files: Vec<DuplicateFile>,
}

/// Find byte-identical files by grouping on size before computing SHA-256.
#[tauri::command]
pub async fn find_duplicates(
    root_path: String,
    min_size_bytes: u64,
) -> Result<Vec<DuplicateGroup>, String> {
    tauri::async_runtime::spawn_blocking(move || find_duplicates_inner(root_path, min_size_bytes))
        .await.map_err(|e| e.to_string())?
}

fn find_duplicates_inner(root_path: String, min_size_bytes: u64) -> Result<Vec<DuplicateGroup>, String> {
    let root = crate::scan::engine::normalize_root(&root_path)?;
    let mut by_size: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    let minimum = min_size_bytes.max(1);

    for entry in WalkBuilder::new(root).follow_links(false).build().flatten() {
        if !entry
            .file_type()
            .map(|kind| kind.is_file())
            .unwrap_or(false)
        {
            continue;
        }
        if let Ok(metadata) = entry.metadata() {
            if metadata.len() >= minimum {
                by_size
                    .entry(metadata.len())
                    .or_default()
                    .push(entry.into_path());
            }
        }
    }

    let mut groups = Vec::new();
    for (size_bytes, paths) in by_size.into_iter().filter(|(_, paths)| paths.len() > 1) {
        let mut by_hash: HashMap<String, Vec<PathBuf>> = HashMap::new();
        for path in paths {
            if let Ok(hash) = hash_file(&path) {
                by_hash.entry(hash).or_default().push(path);
            }
        }
        for (hash, matches) in by_hash.into_iter().filter(|(_, matches)| matches.len() > 1) {
            groups.push(DuplicateGroup {
                hash,
                size_bytes,
                reclaimable_bytes: size_bytes.saturating_mul((matches.len() - 1) as u64),
                files: { let mut matches = matches; matches.sort(); matches }
                    .into_iter()
                    .map(|path| DuplicateFile {
                        path: path.to_string_lossy().to_string(),
                        size_bytes,
                    })
                    .collect(),
            });
        }
    }
    groups.sort_by(|left, right| right.reclaimable_bytes.cmp(&left.reclaimable_bytes));
    Ok(groups)
}

fn hash_file(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let mut reader = BufReader::with_capacity(1024 * 1024, file);
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn duplicates_require_identical_contents_and_keep_one_copy() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("a.bin"), vec![1; 100_000]).unwrap();
        std::fs::write(directory.path().join("b.bin"), vec![1; 100_000]).unwrap();
        std::fs::write(directory.path().join("c.bin"), vec![2; 100_000]).unwrap();
        let root = directory.path().to_string_lossy().to_string();
        let groups = find_duplicates_inner(root.clone(), 1).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].files.len(), 2);
        assert_eq!(groups[0].reclaimable_bytes, 100_000);
        assert!(find_duplicates_inner(root, 100_001).unwrap().is_empty());
        assert!(directory.path().join("a.bin").exists());
    }
}
