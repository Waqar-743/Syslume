use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use ignore::WalkBuilder;
use tauri::AppHandle;

use crate::scan::events::{
    emit_error, emit_partial_tree, emit_progress, ErrorPayload, PartialTreePayload, ProgressPayload,
};
use crate::scan::model::{
    ExtensionStat, NodeId, NodeKind, ScanOptions, ScanResult, TreeNode, TreeNodeDelta,
};

const PROGRESS_INTERVAL: Duration = Duration::from_millis(50);
const PARTIAL_INTERVAL: Duration = Duration::from_millis(100);
const MAX_PARTIAL_BATCH: usize = 10000;
const NO_EXTENSION_LABEL: &str = "<none>";

// Directories to skip for faster scanning (Windows system folders and heavy dirs)
const SKIP_DIRS: &[&str] = &[
    // Windows system folders
    "$Recycle.Bin",
    "$RECYCLE.BIN",
    "System Volume Information",
    "Recovery",
    "$WinREAgent",
    "Windows.old",
    "PerfLogs",
    "MSOCache",
    "Config.Msi",
    "Windows",
    "WinSxS",
    // Heavy development folders
    "node_modules",
    ".git",
    ".svn",
    "__pycache__",
    ".cache",
    ".npm",
    ".yarn",
    "vendor",
    // Package managers
    ".nuget",
    ".cargo",
    ".rustup",
    // Build outputs
    "obj",
    "Debug",
    "Release",
    ".next",
    ".turbo",
    // Virtual environments
    "venv",
    ".venv",
    "env",
];

#[derive(Debug)]
pub enum ScanError {
    Canceled,
    Failed(String),
}

/// Check if a directory name should be skipped (system folders)
fn should_skip_dir(name: &str) -> bool {
    SKIP_DIRS.iter().any(|skip| name.eq_ignore_ascii_case(skip))
}

pub fn normalize_root(root_path: &str) -> Result<PathBuf, String> {
    let mut path = PathBuf::from(root_path);
    if !path.is_absolute() {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
        path = cwd.join(path);
    }
    if let Ok(canon) = path.canonicalize() {
        path = canon;
    }
    if !path.exists() {
        return Err("Root path does not exist".to_string());
    }
    Ok(path)
}

pub fn run_scan(
    app_handle: Option<AppHandle>,
    scan_id: String,
    root_path: String,
    options: ScanOptions,
    cancel_flag: Arc<AtomicBool>,
) -> Result<ScanResult, ScanError> {
    let root = normalize_root(&root_path).map_err(ScanError::Failed)?;
    let mut nodes: HashMap<NodeId, TreeNode> = HashMap::with_capacity(50_000);
    let mut path_map: HashMap<String, NodeId> = HashMap::with_capacity(50_000);
    let mut changed_nodes: HashSet<NodeId> = HashSet::with_capacity(5_000);
    let mut extension_stats: HashMap<String, ExtensionStat> = HashMap::with_capacity(200);

    let node_counter = AtomicU64::new(1);
    let root_id = next_node_id(&node_counter);
    let root_path_str = root.to_string_lossy().to_string();
    let root_name = root
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&root_path_str)
        .to_string();

    nodes.insert(
        root_id,
        TreeNode {
            id: root_id,
            parent: None,
            name: root_name,
            path: root_path_str.clone(),
            kind: NodeKind::Dir,
            size_bytes: 0,
            file_ext: None,
            children: Vec::new(),
            modified_unix: None,
            created_unix: None,
            readonly: false,
            is_symlink: false,
        },
    );
    path_map.insert(root_path_str.clone(), root_id);
    changed_nodes.insert(root_id);

    let mut visited_entries: u64 = 0;
    let mut visited_bytes_approx: u64 = 0;
    let mut total_files: u64 = 0;
    let mut total_dirs: u64 = 1;

    let mut last_progress_emit = Instant::now();
    let mut last_partial_emit = Instant::now();
    let mut current_path = root_path_str.clone();

    let mut builder = WalkBuilder::new(&root);
    builder.follow_links(options.follow_symlinks);
    if options.one_file_system {
        builder.same_file_system(true);
    }
    builder.max_depth(options.max_depth.map(|d| d as usize));
    // Performance optimizations
    builder.skip_stdout(true); // Skip stdout for better performance
    builder.git_ignore(false); // Don't use gitignore rules
    builder.git_global(false);
    builder.git_exclude(false);
    builder.ignore(false); // Don't use .ignore files
    builder.standard_filters(false); // Disable all standard filters for speed
    builder.hidden(!options.include_hidden);

    let include_system_dirs = options.include_system_dirs;
    let include_hidden = options.include_hidden;
    let exclude_patterns: Vec<String> = options
        .exclude_patterns
        .iter()
        .map(|pattern| pattern.trim_matches('*').to_lowercase())
        .filter(|pattern| !pattern.is_empty())
        .collect();

    // Apply the selected system-directory and custom exclusions.
    builder.filter_entry(move |entry| {
        #[cfg(windows)]
        if !include_hidden && entry.depth() > 0 {
            use std::os::windows::fs::MetadataExt;
            if entry.metadata().is_ok_and(|m| m.file_attributes() & 2 != 0) { return false; }
        }
        #[cfg(not(windows))]
        let _ = include_hidden;
        let normalized = entry.path().to_string_lossy().to_lowercase();
        if exclude_patterns
            .iter()
            .any(|pattern| normalized.contains(pattern))
        {
            return false;
        }
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            if let Some(name) = entry.file_name().to_str() {
                if !include_system_dirs && should_skip_dir(name) {
                    return false;
                }
            }
        }
        true
    });

    let mut walker = builder.build();

    while let Some(entry) = walker.next() {
        if cancel_flag.load(Ordering::Relaxed) {
            return Err(ScanError::Canceled);
        }
        match entry {
            Ok(entry) => {
                let path = entry.path();
                visited_entries += 1;

                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                if is_dir {
                    let dir_id = ensure_dir_node(
                        &mut nodes,
                        &mut path_map,
                        &mut changed_nodes,
                        path,
                        &node_counter,
                    );

                    if path != root.as_path() {
                        total_dirs += 1;
                    }
                    // Add to parent's children (walker doesn't yield duplicates, so no need to check)
                    if let Some(parent_id) = parent_id_for_path(&path_map, path) {
                        if let Some(parent) = nodes.get_mut(&parent_id) {
                            parent.children.push(dir_id);
                        }
                    }
                } else {
                    // For files, use metadata from entry if available (faster)
                    let metadata = entry.metadata().ok();
                    let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

                    visited_bytes_approx = visited_bytes_approx.saturating_add(size);

                    let parent_id = parent_id_for_path(&path_map, path);
                    let file_id = ensure_file_node(
                        &mut nodes,
                        &mut path_map,
                        &mut changed_nodes,
                        path,
                        parent_id,
                        &node_counter,
                        size,
                        metadata.as_ref(),
                        entry
                            .file_type()
                            .map(|kind| kind.is_symlink())
                            .unwrap_or(false),
                    );
                    total_files += 1;

                    // Add to parent's children (walker doesn't yield duplicates)
                    if let Some(parent_id) = parent_id {
                        if let Some(parent) = nodes.get_mut(&parent_id) {
                            parent.children.push(file_id);
                        }
                    }

                    if let Some(ext) = extract_extension(path) {
                        let entry = extension_stats.entry(ext.clone()).or_insert(ExtensionStat {
                            ext,
                            bytes: 0,
                            count: 0,
                        });
                        entry.bytes = entry.bytes.saturating_add(size);
                        entry.count = entry.count.saturating_add(1);
                    } else {
                        let entry = extension_stats
                            .entry(NO_EXTENSION_LABEL.to_string())
                            .or_insert(ExtensionStat {
                                ext: NO_EXTENSION_LABEL.to_string(),
                                bytes: 0,
                                count: 0,
                            });
                        entry.bytes = entry.bytes.saturating_add(size);
                        entry.count = entry.count.saturating_add(1);
                    }

                    increment_ancestor_sizes(&mut nodes, parent_id, size, &mut changed_nodes);
                }

                // Only emit progress/partial updates every 2000 entries to reduce overhead
                if visited_entries % 2000 == 0 {
                    current_path = path.to_string_lossy().to_string();
                    maybe_emit_progress(
                        &app_handle,
                        &scan_id,
                        visited_entries,
                        visited_bytes_approx,
                        &current_path,
                        &mut last_progress_emit,
                        "walking",
                    );
                    maybe_emit_partial(
                        &app_handle,
                        &scan_id,
                        &nodes,
                        &mut changed_nodes,
                        &mut last_partial_emit,
                    );
                }
            }
            Err(err) => {
                let error_path: Option<String> = None;
                emit_error_optional(&app_handle, &scan_id, &err.to_string(), error_path);
            }
        }
    }

    if cancel_flag.load(Ordering::Relaxed) {
        return Err(ScanError::Canceled);
    }

    recompute_dir_sizes(&mut nodes);
    changed_nodes.extend(nodes.keys().copied());
    if app_handle.is_some() {
        while emit_partial_batch(&app_handle, &scan_id, &nodes, &mut changed_nodes) {}
        let _ = Instant::now(); // Mark as end of partial emissions
    }

    let total_bytes = nodes.get(&root_id).map(|n| n.size_bytes).unwrap_or(0);
    let mut extension_stats_vec: Vec<ExtensionStat> = extension_stats.into_values().collect();
    extension_stats_vec.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    let result = ScanResult {
        scan_id,
        root_id,
        total_bytes,
        total_files,
        total_dirs,
        extension_stats: extension_stats_vec,
    };

    if let Some(handle) = app_handle {
        let payload = ProgressPayload {
            scan_id: result.scan_id.clone(),
            visited_entries,
            visited_bytes_approx,
            current_path,
            phase: "finalizing".to_string(),
        };
        emit_progress(&handle, payload);
    }
    Ok(result)
}

fn next_node_id(counter: &AtomicU64) -> NodeId {
    counter.fetch_add(1, Ordering::Relaxed)
}

fn ensure_dir_node(
    nodes: &mut HashMap<NodeId, TreeNode>,
    path_map: &mut HashMap<String, NodeId>,
    changed_nodes: &mut HashSet<NodeId>,
    path: &Path,
    counter: &AtomicU64,
) -> NodeId {
    let path_str = path.to_string_lossy().to_string();
    if let Some(id) = path_map.get(&path_str).copied() {
        return id;
    }
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&path_str)
        .to_string();
    let id = next_node_id(counter);
    let parent_id = parent_id_for_path(path_map, path);
    nodes.insert(
        id,
        TreeNode {
            id,
            parent: parent_id,
            name,
            path: path_str.clone(),
            kind: NodeKind::Dir,
            size_bytes: 0,
            file_ext: None,
            children: Vec::new(),
            modified_unix: None,
            created_unix: None,
            readonly: false,
            is_symlink: false,
        },
    );
    path_map.insert(path_str, id);
    changed_nodes.insert(id);
    id
}

fn ensure_file_node(
    nodes: &mut HashMap<NodeId, TreeNode>,
    path_map: &mut HashMap<String, NodeId>,
    changed_nodes: &mut HashSet<NodeId>,
    path: &Path,
    parent_id: Option<NodeId>,
    counter: &AtomicU64,
    size: u64,
    metadata: Option<&std::fs::Metadata>,
    is_symlink: bool,
) -> NodeId {
    let path_str = path.to_string_lossy().to_string();
    if let Some(id) = path_map.get(&path_str).copied() {
        if let Some(node) = nodes.get_mut(&id) {
            node.size_bytes = size;
            changed_nodes.insert(id);
        }
        return id;
    }
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&path_str)
        .to_string();
    let id = next_node_id(counter);
    let ext = extract_extension(path);
    nodes.insert(
        id,
        TreeNode {
            id,
            parent: parent_id,
            name,
            path: path_str.clone(),
            kind: NodeKind::File,
            size_bytes: size,
            file_ext: ext,
            children: Vec::new(),
            modified_unix: metadata.and_then(|value| system_time_to_unix(value.modified().ok())),
            created_unix: metadata.and_then(|value| system_time_to_unix(value.created().ok())),
            readonly: metadata
                .map(|value| value.permissions().readonly())
                .unwrap_or(false),
            is_symlink,
        },
    );
    path_map.insert(path_str, id);
    changed_nodes.insert(id);
    id
}

fn parent_id_for_path(path_map: &HashMap<String, NodeId>, path: &Path) -> Option<NodeId> {
    path.parent()
        .and_then(|p| path_map.get(&p.to_string_lossy().to_string()))
        .copied()
}

fn increment_ancestor_sizes(
    nodes: &mut HashMap<NodeId, TreeNode>,
    mut parent_id: Option<NodeId>,
    size: u64,
    changed_nodes: &mut HashSet<NodeId>,
) {
    while let Some(id) = parent_id {
        if let Some(node) = nodes.get_mut(&id) {
            node.size_bytes = node.size_bytes.saturating_add(size);
            changed_nodes.insert(id);
            parent_id = node.parent;
        } else {
            break;
        }
    }
}

fn extract_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
}

fn system_time_to_unix(value: Option<SystemTime>) -> Option<u64> {
    value?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs())
}

fn recompute_dir_sizes(nodes: &mut HashMap<NodeId, TreeNode>) {
    let mut order: Vec<(usize, NodeId)> = Vec::with_capacity(nodes.len());
    for (id, node) in nodes.iter() {
        let mut depth = 0usize;
        let mut current = node.parent;
        while let Some(pid) = current {
            depth += 1;
            current = nodes.get(&pid).and_then(|n| n.parent);
        }
        order.push((depth, *id));
    }
    order.sort_by(|a, b| b.0.cmp(&a.0));

    for (_, id) in order {
        let kind = nodes.get(&id).map(|n| n.kind).unwrap_or(NodeKind::File);
        if kind == NodeKind::Dir {
            let mut sum = 0u64;
            let children = nodes
                .get(&id)
                .map(|n| n.children.clone())
                .unwrap_or_default();
            for child_id in children {
                if let Some(child) = nodes.get(&child_id) {
                    sum = sum.saturating_add(child.size_bytes);
                }
            }
            if let Some(node) = nodes.get_mut(&id) {
                node.size_bytes = sum;
            }
        }
    }
}

fn maybe_emit_progress(
    app_handle: &Option<AppHandle>,
    scan_id: &str,
    visited_entries: u64,
    visited_bytes_approx: u64,
    current_path: &str,
    last_emit: &mut Instant,
    phase: &str,
) {
    if last_emit.elapsed() < PROGRESS_INTERVAL {
        return;
    }
    if let Some(handle) = app_handle {
        let payload = ProgressPayload {
            scan_id: scan_id.to_string(),
            visited_entries,
            visited_bytes_approx,
            current_path: current_path.to_string(),
            phase: phase.to_string(),
        };
        emit_progress(handle, payload);
        *last_emit = Instant::now();
    }
}

fn maybe_emit_partial(
    app_handle: &Option<AppHandle>,
    scan_id: &str,
    nodes: &HashMap<NodeId, TreeNode>,
    changed_nodes: &mut HashSet<NodeId>,
    last_emit: &mut Instant,
) {
    if last_emit.elapsed() < PARTIAL_INTERVAL {
        return;
    }
    if emit_partial_batch(app_handle, scan_id, nodes, changed_nodes) {
        *last_emit = Instant::now();
    }
}

fn emit_partial_batch(
    app_handle: &Option<AppHandle>,
    scan_id: &str,
    nodes: &HashMap<NodeId, TreeNode>,
    changed_nodes: &mut HashSet<NodeId>,
) -> bool {
    if changed_nodes.is_empty() {
        return false;
    }
    if let Some(handle) = app_handle {
        let mut deltas = Vec::new();
        let mut count = 0usize;
        let mut ids: Vec<NodeId> = changed_nodes.drain().collect();
        ids.sort_unstable();
        for id in ids {
            if count >= MAX_PARTIAL_BATCH {
                changed_nodes.insert(id);
                continue;
            }
            if let Some(node) = nodes.get(&id) {
                deltas.push(node_to_delta(node));
                count += 1;
            }
        }
        emit_partial_tree(
            handle,
            PartialTreePayload {
                scan_id: scan_id.to_string(),
                nodes: deltas,
                updated_at: now_millis(),
            },
        );
        return true;
    }
    false
}

fn node_to_delta(node: &TreeNode) -> TreeNodeDelta {
    TreeNodeDelta {
        id: node.id,
        parent: node.parent,
        name: node.name.clone(),
        path: node.path.clone(),
        kind: node.kind,
        size_bytes: node.size_bytes,
        file_ext: node.file_ext.clone(),
        modified_unix: node.modified_unix,
        created_unix: node.created_unix,
        readonly: node.readonly,
        is_symlink: node.is_symlink,
    }
}

fn emit_error_optional(
    app_handle: &Option<AppHandle>,
    scan_id: &str,
    message: &str,
    path: Option<String>,
) {
    if let Some(handle) = app_handle {
        emit_error(
            handle,
            ErrorPayload {
                scan_id: scan_id.to_string(),
                message: message.to_string(),
                path,
            },
        );
    }
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{create_dir_all, write};
    use tempfile::tempdir;

    #[test]
    fn aggregates_directory_sizes() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path();
        let subdir = root.join("sub");
        create_dir_all(&subdir).expect("create subdir");
        write(root.join("a.txt"), vec![0u8; 5]).expect("write a");
        write(subdir.join("b.bin"), vec![0u8; 7]).expect("write b");

        let result = run_scan(
            None,
            "test-scan".to_string(),
            root.to_string_lossy().to_string(),
            ScanOptions::default(),
            Arc::new(AtomicBool::new(false)),
        )
        .expect("scan result");

        assert_eq!(result.total_bytes, 12);
        assert_eq!(result.total_files, 2);
    }

    #[test]
    fn extracts_last_extension() {
        let path = Path::new("archive.tar.gz");
        let ext = extract_extension(path).expect("extension");
        assert_eq!(ext, "gz");
    }

    #[test]
    fn hidden_and_custom_exclusions_are_respected() {
        let temp = tempdir().unwrap();
        write(temp.path().join("visible.bin"), vec![0; 3]).unwrap();
        write(temp.path().join(".hidden.bin"), vec![0; 5]).unwrap();
        create_dir_all(temp.path().join("excluded")).unwrap();
        write(temp.path().join("excluded/large.bin"), vec![0; 20]).unwrap();
        let root = temp.path().to_string_lossy().to_string();
        let options = ScanOptions { exclude_patterns: vec!["excluded".into()], ..Default::default() };
        let first = run_scan(None, "filters".into(), root.clone(), options.clone(), Arc::new(AtomicBool::new(false))).unwrap();
        assert_eq!(first.total_bytes, 3);
        let second = run_scan(None, "hidden".into(), root, ScanOptions { include_hidden: true, ..options }, Arc::new(AtomicBool::new(false))).unwrap();
        assert_eq!(second.total_bytes, 8);
    }

    #[test]
    fn cancellation_stops_scan() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path();
        let cancel = Arc::new(AtomicBool::new(true));

        let result = run_scan(
            None,
            "test-cancel".to_string(),
            root.to_string_lossy().to_string(),
            ScanOptions::default(),
            cancel,
        );

        assert!(matches!(result, Err(ScanError::Canceled)));
    }
}
