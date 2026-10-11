use serde::Serialize;
use std::sync::mpsc::{self, Sender};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::{CpuRefreshKind, ProcessRefreshKind, ProcessesToUpdate, System};

#[cfg(windows)]
mod windows;

#[derive(Clone, Debug, Serialize)]
pub struct ProcessReading {
    pid: u32,
    name: String,
    cpu_percent: Option<f32>,
    memory_bytes: u64,
}

#[derive(Clone, Debug, Serialize, Default)]
pub struct BatteryReading {
    pub name: String,
    pub charge_percent: Option<f64>,
    pub status: String,
    pub design_mwh: Option<u64>,
    pub full_charge_mwh: Option<u64>,
    pub remaining_mwh: Option<u64>,
    pub health_percent: Option<f64>,
    pub wear_percent: Option<f64>,
    pub cycle_count: Option<u32>,
    pub note: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct GpuEngine {
    pub name: String,
    pub utilization: f64,
}

#[derive(Clone, Debug, Serialize, Default)]
pub struct GpuReading {
    pub id: String,
    pub name: String,
    pub dedicated_total_bytes: u64,
    pub shared_limit_bytes: u64,
    pub dedicated_used_bytes: Option<u64>,
    pub shared_used_bytes: Option<u64>,
    pub utilization: Option<f64>,
    pub engines: Vec<GpuEngine>,
    pub note: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct SpecGroup {
    pub name: String,
    pub fields: Vec<(String, String)>,
}

#[derive(Clone, Debug, Serialize)]
pub struct MonitorSnapshot {
    pub sampled_at: u64,
    pub cpu_percent: Option<f32>,
    pub core_percent: Vec<f32>,
    pub cpu_name: String,
    pub physical_cores: Option<usize>,
    pub logical_cores: usize,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    pub swap_used_bytes: u64,
    pub swap_total_bytes: u64,
    pub uptime_seconds: u64,
    pub os: String,
    pub architecture: String,
    pub host_name: String,
    pub processes: Option<Vec<ProcessReading>>,
    pub batteries: Vec<BatteryReading>,
    pub battery_note: String,
    pub gpus: Vec<GpuReading>,
    pub gpu_note: String,
    pub specifications: Vec<SpecGroup>,
}

struct Request {
    processes: bool,
    reply: Sender<MonitorSnapshot>,
}

pub struct MonitorState {
    sender: Sender<Request>,
}

impl MonitorState {
    pub fn new() -> Self {
        let (sender, receiver) = mpsc::channel::<Request>();
        // COM connections and PDH handles remain confined to this thread. No polling
        // happens while the frontend is paused or hidden; the worker blocks on recv.
        std::thread::spawn(move || {
            let mut system = System::new();
            system.refresh_cpu_specifics(CpuRefreshKind::everything());
            let mut previous_sample = Instant::now();
            let mut has_process_sample = false;
            #[cfg(windows)]
            let mut native = windows::NativeMonitor::new();
            while let Ok(request) = receiver.recv() {
                let ready = previous_sample.elapsed() >= sysinfo::MINIMUM_CPU_UPDATE_INTERVAL;
                system.refresh_cpu_usage();
                system.refresh_memory();
                let logical = system.cpus().len().max(1);
                let processes = if request.processes {
                    system.refresh_processes_specifics(
                        ProcessesToUpdate::All,
                        true,
                        ProcessRefreshKind::nothing().with_cpu().with_memory(),
                    );
                    let items = system.processes().iter().map(|(pid, process)| ProcessReading {
                        pid: pid.as_u32(),
                        name: process.name().to_string_lossy().to_string(),
                        cpu_percent: (ready && has_process_sample)
                            .then(|| (process.cpu_usage() / logical as f32).clamp(0.0, 100.0)),
                        memory_bytes: process.memory(),
                    }).collect();
                    has_process_sample = true;
                    Some(items)
                } else {
                    // A later return to Processes must warm up its CPU interval again.
                    has_process_sample = false;
                    None
                };
                previous_sample = Instant::now();
                #[cfg(windows)]
                let (batteries, battery_note, gpus, gpu_note, specifications) = native.sample();
                #[cfg(not(windows))]
                let (batteries, battery_note, gpus, gpu_note, specifications) = (
                    vec![], "Battery monitoring requires Windows.".into(), vec![],
                    "Graphics monitoring requires Windows.".into(), vec![],
                );
                let snapshot = MonitorSnapshot {
                    sampled_at: SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64,
                    cpu_percent: ready.then(|| system.global_cpu_usage().clamp(0.0, 100.0)),
                    core_percent: if ready { system.cpus().iter().map(|c| c.cpu_usage()).collect() } else { vec![] },
                    cpu_name: system.cpus().first().map(|c| c.brand().into()).unwrap_or_else(|| "Processor unavailable".into()),
                    physical_cores: System::physical_core_count(),
                    logical_cores: logical,
                    memory_used_bytes: system.used_memory(),
                    memory_total_bytes: system.total_memory(),
                    swap_used_bytes: system.used_swap(),
                    swap_total_bytes: system.total_swap(),
                    uptime_seconds: System::uptime(),
                    os: System::long_os_version().unwrap_or_else(|| "Operating system unavailable".into()),
                    architecture: System::cpu_arch(),
                    host_name: System::host_name().unwrap_or_else(|| "This computer".into()),
                    processes, batteries, battery_note, gpus, gpu_note, specifications,
                };
                let _ = request.reply.send(snapshot);
            }
        });
        Self { sender }
    }

    fn read(&self, processes: bool) -> Result<MonitorSnapshot, String> {
        let (reply, receiver) = mpsc::channel();
        self.sender.send(Request { processes, reply }).map_err(|_| "The monitoring worker stopped. Restart Syslume.".to_string())?;
        receiver.recv_timeout(Duration::from_secs(20)).map_err(|_| "Windows took too long to return monitoring data. Try again.".to_string())
    }
}

#[tauri::command]
pub async fn get_monitor_snapshot(processes: bool, state: tauri::State<'_, MonitorState>) -> Result<MonitorSnapshot, String> {
    let sender = state.sender.clone();
    tauri::async_runtime::spawn_blocking(move || MonitorState { sender }.read(processes))
        .await.map_err(|e| e.to_string())?
}

pub fn capacity_health(design: Option<u64>, full: Option<u64>) -> Option<f64> {
    match (design, full) {
        (Some(d), Some(f)) if d > 0 && f > 0 => Some((f as f64 / d as f64 * 100.0).clamp(0.0, 100.0)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn health_requires_comparable_nonzero_capacity() {
        assert_eq!(capacity_health(Some(50000), Some(40000)), Some(80.0));
        assert_eq!(capacity_health(Some(0), Some(40000)), None);
        assert_eq!(capacity_health(None, Some(40000)), None);
        assert_eq!(capacity_health(Some(50000), Some(52000)), Some(100.0));
    }
    #[test]
    #[ignore = "reads live Windows hardware; run explicitly"]
    fn live_windows_snapshot() {
        let state = MonitorState::new();
        let first = state.read(true).expect("first snapshot");
        std::thread::sleep(Duration::from_millis(500));
        let second = state.read(true).expect("second snapshot");
        assert!(second.memory_total_bytes > 0);
        assert!(second.memory_used_bytes <= second.memory_total_bytes);
        assert!(second.cpu_percent.is_some_and(|v| (0.0..=100.0).contains(&v)));
        assert!(!second.processes.as_ref().unwrap().is_empty());
        for gpu in &second.gpus {
            assert!(!gpu.name.is_empty());
            assert!(gpu.utilization.is_none_or(|v| (0.0..=100.0).contains(&v)));
        }
        println!("{}", serde_json::to_string_pretty(&second).unwrap());
        assert!(second.sampled_at > first.sampled_at);
    }
}
