use super::{capacity_health, BatteryReading, GpuEngine, GpuReading, SpecGroup};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::time::{Duration, Instant};
use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE};
use windows_sys::Win32::System::Performance::*;
use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use wmi::WMIConnection;

type Row = HashMap<String, Value>;
type NativeSample = (Vec<BatteryReading>, String, Vec<GpuReading>, String, Vec<SpecGroup>);

pub struct NativeMonitor {
    battery_wmi: Option<WMIConnection>,
    batteries: Vec<BatteryReading>,
    battery_note: String,
    last_battery: Option<Instant>,
    specs: Vec<SpecGroup>,
    gpu: GpuCounters,
}

impl NativeMonitor {
    pub fn new() -> Self {
        let specs = inventory();
        let battery_wmi = WMIConnection::with_namespace_path("ROOT\\WMI").ok();
        Self {
            battery_wmi, batteries: vec![], battery_note: String::new(),
            last_battery: None, specs, gpu: GpuCounters::new(),
        }
    }

    pub fn sample(&mut self) -> NativeSample {
        if self.last_battery.is_none_or(|t| t.elapsed() >= Duration::from_secs(30)) {
            let (batteries, note) = read_batteries(self.battery_wmi.as_ref());
            self.batteries = batteries;
            self.battery_note = note;
            self.last_battery = Some(Instant::now());
        }
        let (gpus, gpu_note) = self.gpu.sample();
        (self.batteries.clone(), self.battery_note.clone(), gpus, gpu_note, self.specs.clone())
    }
}

fn inventory() -> Vec<SpecGroup> {
    let Ok(connection) = WMIConnection::new() else {
        return vec![SpecGroup { name: "Windows inventory".into(), fields: vec![("Availability".into(), "Windows Management Instrumentation is unavailable.".into())] }];
    };
    let queries = [
        ("Windows", "SELECT Caption, Version, BuildNumber, OSArchitecture FROM Win32_OperatingSystem"),
        ("Computer", "SELECT Manufacturer, Model, SystemType, TotalPhysicalMemory FROM Win32_ComputerSystem"),
        ("Processor", "SELECT Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, L2CacheSize, L3CacheSize FROM Win32_Processor"),
        ("Memory modules", "SELECT Manufacturer, Capacity, Speed, ConfiguredClockSpeed, DeviceLocator FROM Win32_PhysicalMemory"),
        ("Motherboard", "SELECT Manufacturer, Product, Version FROM Win32_BaseBoard"),
        ("Firmware", "SELECT Manufacturer, SMBIOSBIOSVersion, ReleaseDate FROM Win32_BIOS"),
        ("Storage hardware", "SELECT Model, InterfaceType, MediaType, Size FROM Win32_DiskDrive"),
        ("Display drivers", "SELECT Name, DriverVersion, VideoProcessor, CurrentHorizontalResolution, CurrentVerticalResolution FROM Win32_VideoController"),
        ("Network hardware", "SELECT Name, Manufacturer, Speed FROM Win32_NetworkAdapter WHERE PhysicalAdapter = TRUE"),
        ("Audio", "SELECT Name, Manufacturer, Status FROM Win32_SoundDevice"),
    ];
    queries.iter().flat_map(|(name, query)| match connection.raw_query::<Row>(query) {
        Ok(rows) => rows.into_iter().enumerate().map(|(i, row)| {
            let mut fields: Vec<_> = row.into_iter().filter_map(|(key, v)| {
                if v.is_null() { return None; }
                let text = match &v { Value::String(s) => s.clone(), _ => v.to_string() };
                if text.is_empty() { None } else { Some((human_label(&key), text)) }
            }).collect();
            fields.sort_by(|a,b| a.0.cmp(&b.0));
            SpecGroup { name: if i == 0 { (*name).into() } else { format!("{name} {}", i+1) }, fields }
        }).collect::<Vec<_>>(),
        Err(_) => vec![SpecGroup { name: (*name).into(), fields: vec![("Availability".into(), "Not reported by Windows.".into())] }],
    }).collect()
}

fn human_label(key: &str) -> String {
    match key {
        "TotalPhysicalMemory" | "Capacity" | "Size" => format!("{key} (bytes)"),
        "MaxClockSpeed" | "Speed" | "ConfiguredClockSpeed" if key != "Speed" => format!("{key} (MHz)"),
        "L2CacheSize" | "L3CacheSize" => format!("{key} (KB)"),
        _ => key.into(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct StaticBattery {
    instance_name: String,
    designed_capacity: Option<u64>,
    device_name: Option<String>,
    capabilities: Option<u32>,
}
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct FullBattery { instance_name: String, full_charged_capacity: Option<u64> }
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct StatusBattery {
    instance_name: String,
    remaining_capacity: Option<u64>,
    charging: Option<bool>,
    discharging: Option<bool>,
    power_online: Option<bool>,
}
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct CycleBattery { instance_name: String, cycle_count: Option<u32> }

fn valid_capacity(value: Option<u64>) -> Option<u64> {
    value.filter(|v| *v > 0 && *v != u32::MAX as u64)
}

fn read_batteries(connection: Option<&WMIConnection>) -> (Vec<BatteryReading>, String) {
    let mut power = SYSTEM_POWER_STATUS::default();
    let power_available = unsafe { GetSystemPowerStatus(&mut power) != 0 };
    if power_available && power.BatteryFlag != 255 && power.BatteryFlag & 128 != 0 {
        return (vec![], "No battery detected. This computer can still be monitored on mains power.".into());
    }
    let fallback = || {
        if !power_available || power.BatteryFlag == 255 {
            return (vec![], "Windows did not report battery information.".into());
        }
        let charge = (power.BatteryLifePercent <= 100).then_some(power.BatteryLifePercent as f64);
        (vec![BatteryReading {
            name: "System battery".into(), charge_percent: charge,
            status: if power.BatteryFlag & 8 != 0 { "Charging" } else if power.ACLineStatus == 1 { "Plugged in" } else { "On battery" }.into(),
            note: "Capacity and wear are not reported by this battery driver.".into(),
            ..BatteryReading::default()
        }], "Charge and power status provided by Windows.".into())
    };
    let Some(connection) = connection else { return fallback(); };
    let Ok(statics) = connection.raw_query::<StaticBattery>("SELECT InstanceName, DesignedCapacity, DeviceName, Capabilities FROM BatteryStaticData WHERE Active = TRUE") else { return fallback(); };
    if statics.is_empty() { return fallback(); }
    let full = connection.raw_query::<FullBattery>("SELECT InstanceName, FullChargedCapacity FROM BatteryFullChargedCapacity WHERE Active = TRUE").unwrap_or_default();
    let status = connection.raw_query::<StatusBattery>("SELECT InstanceName, RemainingCapacity, Charging, Discharging, PowerOnline FROM BatteryStatus WHERE Active = TRUE").unwrap_or_default();
    let cycles = connection.raw_query::<CycleBattery>("SELECT InstanceName, CycleCount FROM BatteryCycleCount WHERE Active = TRUE").unwrap_or_default();
    let batteries = statics.into_iter().map(|s| {
        let f = full.iter().find(|f| f.instance_name.eq_ignore_ascii_case(&s.instance_name));
        let state = status.iter().find(|f| f.instance_name.eq_ignore_ascii_case(&s.instance_name));
        let relative = s.capabilities.is_some_and(|v| v & 0x40000000 != 0);
        let design_raw = valid_capacity(s.designed_capacity);
        let full_raw = valid_capacity(f.and_then(|f| f.full_charged_capacity));
        let remaining_raw = state.and_then(|f| f.remaining_capacity).filter(|v| *v != u32::MAX as u64);
        let health = if relative { None } else { capacity_health(design_raw, full_raw) };
        let charge = match (remaining_raw, full_raw) {
            (Some(r), Some(f)) => Some((r as f64 / f as f64 * 100.0).clamp(0.0, 100.0)),
            _ if power_available && status.len() == 1 && power.BatteryLifePercent <= 100 => Some(power.BatteryLifePercent as f64),
            _ => None,
        };
        let status_text = match state {
            Some(st) if st.charging == Some(true) => "Charging",
            Some(st) if st.discharging == Some(true) => "Discharging",
            Some(st) if st.power_online == Some(true) => "Plugged in",
            _ => "Status unavailable",
        };
        BatteryReading {
            name: s.device_name.unwrap_or_else(|| "Battery".into()), charge_percent: charge,
            status: status_text.into(), design_mwh: if relative { None } else { design_raw },
            full_charge_mwh: if relative { None } else { full_raw },
            remaining_mwh: if relative { None } else { remaining_raw },
            health_percent: health, wear_percent: health.map(|h| 100.0-h),
            cycle_count: cycles.iter().find(|f| f.instance_name.eq_ignore_ascii_case(&s.instance_name)).and_then(|f| f.cycle_count).filter(|v| *v > 0 && *v != u32::MAX),
            note: if relative { "The driver reports relative capacity; energy capacity and wear are unavailable." } else if health.is_none() { "The battery driver does not expose enough capacity data to calculate wear." } else { "Wear compares full-charge capacity with the battery's original design capacity." }.into(),
        }
    }).collect();
    (batteries, "Battery readings refresh every 30 seconds. Capacity is reported by the hardware driver.".into())
}

struct GpuCounters {
    query: PDH_HQUERY,
    engine: PDH_HCOUNTER,
    dedicated: PDH_HCOUNTER,
    shared: PDH_HCOUNTER,
    adapters: Vec<GpuReading>,
    last_sample: Instant,
}

impl GpuCounters {
    fn new() -> Self {
        let mut adapters = vec![];
        // Adapter LUIDs link DXGI hardware to PDH instance names; WMI enumeration
        // order is never used to guess which utilization belongs to which GPU.
        if let Ok(factory) = unsafe { CreateDXGIFactory1::<IDXGIFactory1>() } {
            let mut i = 0;
            while let Ok(adapter) = unsafe { factory.EnumAdapters1(i) } {
                i += 1;
                if let Ok(desc) = unsafe { adapter.GetDesc1() } {
                    if desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 { continue; }
                    let length = desc.Description.iter().position(|c| *c == 0).unwrap_or(desc.Description.len());
                    adapters.push(GpuReading {
                        id: format!("luid_0x{:08x}_0x{:08x}", desc.AdapterLuid.HighPart as u32, desc.AdapterLuid.LowPart),
                        name: String::from_utf16_lossy(&desc.Description[..length]),
                        dedicated_total_bytes: desc.DedicatedVideoMemory as u64,
                        shared_limit_bytes: desc.SharedSystemMemory as u64,
                        ..GpuReading::default()
                    });
                }
            }
        }
        let mut result = Self { query: std::ptr::null_mut(), engine: std::ptr::null_mut(), dedicated: std::ptr::null_mut(), shared: std::ptr::null_mut(), adapters, last_sample: Instant::now() };
        unsafe {
            if PdhOpenQueryW(std::ptr::null(), 0, &mut result.query) == 0 {
                result.engine = result.add("\\GPU Engine(*)\\Utilization Percentage");
                result.dedicated = result.add("\\GPU Adapter Memory(*)\\Dedicated Usage");
                result.shared = result.add("\\GPU Adapter Memory(*)\\Shared Usage");
                PdhCollectQueryData(result.query);
            }
        }
        result
    }

    unsafe fn add(&self, path: &str) -> PDH_HCOUNTER {
        let name: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
        let mut counter = std::ptr::null_mut();
        if PdhAddEnglishCounterW(self.query, name.as_ptr(), 0, &mut counter) == 0 { counter } else { std::ptr::null_mut() }
    }

    fn sample(&mut self) -> (Vec<GpuReading>, String) {
        let ready = self.last_sample.elapsed() >= Duration::from_millis(200);
        let collected = !self.query.is_null() && unsafe { PdhCollectQueryData(self.query) == 0 };
        self.last_sample = Instant::now();
        let engines = if collected && ready { counter_values(self.engine) } else { None };
        let dedicated = if collected { counter_values(self.dedicated) } else { None };
        let shared = if collected { counter_values(self.shared) } else { None };
        let adapters = self.adapters.iter().cloned().map(|mut adapter| {
            let mut physical_engines: BTreeMap<String, (String, f64)> = BTreeMap::new();
            if let Some(values) = &engines {
                for (instance, value) in values {
                    if !instance.contains(&adapter.id) { continue; }
                    if let Some(pos) = instance.find("_phys_") {
                        let key = instance[pos..].to_string();
                        let kind = instance.split("_engtype_").nth(1).unwrap_or("Engine").to_string();
                        let entry = physical_engines.entry(key).or_insert((kind, 0.0));
                        entry.1 += value;
                    }
                }
            }
            adapter.engines = physical_engines.into_values().map(|(name, utilization)| GpuEngine { name, utilization: utilization.clamp(0.0, 100.0) }).collect();
            // A functioning wildcard counter with no active instances reports idle,
            // while unavailable counters stay null rather than becoming a fake zero.
            adapter.utilization = engines.as_ref().map(|_| adapter.engines.iter().map(|e| e.utilization).fold(0.0, f64::max));
            let memory_sum = |values: &Option<Vec<(String, f64)>>| values.as_ref().and_then(|values| {
                let matching: Vec<_> = values.iter().filter(|(name,_)| name.contains(&adapter.id)).collect();
                (!matching.is_empty()).then(|| matching.iter().map(|(_,v)| v.max(0.0) as u64).sum())
            });
            adapter.dedicated_used_bytes = memory_sum(&dedicated);
            adapter.shared_used_bytes = memory_sum(&shared);
            adapter.note = if adapter.utilization.is_none() { "Live utilization is unavailable from Windows GPU counters." } else { "Overall use is the busiest GPU engine. Temperature, fan speed, clocks and power are not exposed by this provider." }.into();
            adapter
        }).collect::<Vec<_>>();
        let note = if adapters.is_empty() { "No physical graphics adapter was reported by DXGI." } else { "Native Windows counters; shared memory is system RAM available to the GPU, not extra dedicated VRAM." }.into();
        (adapters, note)
    }
}

impl Drop for GpuCounters {
    fn drop(&mut self) { if !self.query.is_null() { unsafe { PdhCloseQuery(self.query); } } }
}

fn counter_values(counter: PDH_HCOUNTER) -> Option<Vec<(String, f64)>> {
    if counter.is_null() { return None; }
    unsafe {
        let mut bytes = 0;
        let mut count = 0;
        let status = PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE | 0x8000, &mut bytes, &mut count, std::ptr::null_mut());
        if status != PDH_MORE_DATA && status != 0 { return None; }
        if bytes == 0 { return Some(vec![]); }
        if bytes > 16 * 1024 * 1024 { return None; }
        // u64 storage gives the Windows structs their required alignment.
        let mut buffer = vec![0u64; (bytes as usize).div_ceil(8)];
        let pointer = buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
        if PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE | 0x8000, &mut bytes, &mut count, pointer) != 0 { return None; }
        let mut values = vec![];
        for item in std::slice::from_raw_parts(pointer, count as usize) {
            if item.FmtValue.CStatus != 0 && item.FmtValue.CStatus != 1 { continue; }
            if item.szName.is_null() { continue; }
            let mut length = 0;
            while length < 4096 && *item.szName.add(length) != 0 { length += 1; }
            let name = String::from_utf16_lossy(std::slice::from_raw_parts(item.szName, length)).to_lowercase();
            let value = item.FmtValue.Anonymous.doubleValue;
            if value.is_finite() { values.push((name, value)); }
        }
        Some(values)
    }
}
