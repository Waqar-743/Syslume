pub mod scan;
pub mod monitor;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = scan::state::AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .manage(monitor::MonitorState::new())
        .invoke_handler(tauri::generate_handler![
            monitor::get_monitor_snapshot,
            scan::commands::start_scan,
            scan::commands::cancel_scan,
            scan::commands::get_scan_result,
            scan::commands::list_roots,
            scan::commands::open_in_explorer,
            scan::commands::delete_path,
            scan::commands::get_path_size,
            scan::commands::get_file_safety_level,
            scan::commands::get_file_details,
            scan::commands::smart_delete,
            scan::commands::bulk_smart_delete,
            scan::commands::find_duplicates
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
