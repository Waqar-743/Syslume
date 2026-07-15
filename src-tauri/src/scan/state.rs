use std::collections::HashMap;
use std::sync::{atomic::AtomicBool, Arc, Mutex};
use std::time::SystemTime;

use crate::scan::model::ScanResult;

#[derive(Clone)]
pub struct AppState {
    active_scans: Arc<Mutex<HashMap<String, ScanState>>>,
    results: Arc<Mutex<HashMap<String, ScanResult>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            active_scans: Arc::new(Mutex::new(HashMap::new())),
            results: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn insert_scan(&self, scan_id: String, scan_state: ScanState) {
        if let Ok(mut guard) = self.active_scans.lock() {
            guard.insert(scan_id, scan_state);
        }
    }

    pub fn get_cancel_flag(&self, scan_id: &str) -> Option<Arc<AtomicBool>> {
        self.active_scans
            .lock()
            .ok()
            .and_then(|guard| guard.get(scan_id).map(|s| s.cancel_flag.clone()))
    }

    pub fn cancel_scan(&self, scan_id: &str) -> bool {
        if let Ok(guard) = self.active_scans.lock() {
            if let Some(state) = guard.get(scan_id) {
                state
                    .cancel_flag
                    .store(true, std::sync::atomic::Ordering::Relaxed);
                return true;
            }
        }
        false
    }

    pub fn finish_scan(&self, scan_id: &str, result: ScanResult) {
        if let Ok(mut guard) = self.results.lock() {
            guard.insert(scan_id.to_string(), result);
        }
        if let Ok(mut guard) = self.active_scans.lock() {
            guard.remove(scan_id);
        }
    }

    pub fn remove_scan(&self, scan_id: &str) {
        if let Ok(mut guard) = self.active_scans.lock() {
            guard.remove(scan_id);
        }
    }

    pub fn get_result(&self, scan_id: &str) -> Option<ScanResult> {
        self.results
            .lock()
            .ok()
            .and_then(|guard| guard.get(scan_id).cloned())
    }
}

pub struct ScanState {
    pub cancel_flag: Arc<AtomicBool>,
    pub started_at: SystemTime,
}

impl ScanState {
    pub fn new() -> Self {
        Self {
            cancel_flag: Arc::new(AtomicBool::new(false)),
            started_at: SystemTime::now(),
        }
    }
}
