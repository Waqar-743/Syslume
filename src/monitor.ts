import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type Module = "overview" | "storage" | "performance" | "battery" | "processes" | "system" | "gpu";
export interface ProcessReading { pid: number; name: string; cpu_percent: number | null; memory_bytes: number; }
export interface BatteryReading {
  name: string; charge_percent: number | null; status: string;
  design_mwh: number | null; full_charge_mwh: number | null; remaining_mwh: number | null;
  health_percent: number | null; wear_percent: number | null; cycle_count: number | null; note: string;
}
export interface GpuReading {
  id: string; name: string; utilization: number | null;
  dedicated_total_bytes: number; shared_limit_bytes: number;
  dedicated_used_bytes: number | null; shared_used_bytes: number | null;
  engines: { name: string; utilization: number }[]; note: string;
}
export interface MonitorSnapshot {
  sampled_at: number; cpu_percent: number | null; core_percent: number[]; cpu_name: string;
  physical_cores: number | null; logical_cores: number;
  memory_used_bytes: number; memory_total_bytes: number; swap_used_bytes: number; swap_total_bytes: number;
  uptime_seconds: number; os: string; architecture: string; host_name: string;
  processes: ProcessReading[] | null; batteries: BatteryReading[]; battery_note: string;
  gpus: GpuReading[]; gpu_note: string; specifications: { name: string; fields: [string, string][] }[];
}
export interface HistoryPoint { time: number; cpu: number | null; ram: number; gpu: Record<string, number | null>; }
export interface MonitorData {
  snapshot: MonitorSnapshot | null; history: HistoryPoint[]; error: string | null;
  paused: boolean; setPaused: (paused: boolean) => void; interval: number; setInterval: (interval: number) => void;
  hidden: boolean; native: boolean;
}

export function useMonitor(processes: boolean): MonitorData {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [interval, setInterval] = useState(2);
  const [hidden, setHidden] = useState(document.hidden);
  const inFlight = useRef(false);
  const native = isTauri();
  useEffect(() => {
    const handler = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  useEffect(() => {
    if (!native || paused || hidden) return;
    let disposed = false;
    let timer: number | undefined;
    const tick = async () => {
      if (disposed) return;
      if (inFlight.current) { timer = window.setTimeout(tick, 250); return; }
      inFlight.current = true;
      try {
        const next = await invoke<MonitorSnapshot>("get_monitor_snapshot", { processes });
        if (disposed) return;
        setSnapshot(next); setError(null);
        const ram = next.memory_total_bytes ? next.memory_used_bytes / next.memory_total_bytes * 100 : 0;
        setHistory(items => [...items, {
          time: next.sampled_at, cpu: next.cpu_percent, ram,
          gpu: Object.fromEntries(next.gpus.map(g => [g.id, g.utilization])),
        }].slice(-60));
      } catch (e) { if (!disposed) setError(String(e)); }
      finally {
        inFlight.current = false;
        if (!disposed) timer = window.setTimeout(tick, interval * 1000);
      }
    };
    void tick();
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [processes, interval, paused, hidden, native]);
  return { snapshot, history, error, paused, setPaused, interval, setInterval, hidden, native };
}
