import { useMemo, useState } from "react";
import { FORMAT_SIZE } from "../constants";
import type { Module, MonitorData, MonitorSnapshot } from "../monitor";
import type { RootEntry } from "../types";

export const MODULES: { id: Module; title: string; icon: string; detail: string }[] = [
  { id: "overview", title: "Overview", icon: "overview", detail: "Your computer at a glance" },
  { id: "storage", title: "Storage", icon: "storage", detail: "Find where your space goes" },
  { id: "performance", title: "CPU & memory", icon: "performance", detail: "Understand your workload" },
  { id: "battery", title: "Battery", icon: "battery", detail: "Charge, capacity & wear" },
  { id: "processes", title: "Processes", icon: "processes", detail: "What is running right now" },
  { id: "system", title: "System", icon: "system", detail: "Windows & hardware details" },
  { id: "gpu", title: "Graphics", icon: "gpu", detail: "Your GPU's workload" },
];

export function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="18" width="7" height="3" rx="1"/></>,
    storage: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 14h18M16 16.5h2"/></>,
    performance: <><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/></>,
    battery: <><rect x="2" y="6" width="18" height="12" rx="2"/><path d="M22 10v4M6 10v4m4-4v4m4-4v4"/></>,
    processes: <><path d="M9 6h12M9 12h12M9 18h12M3 6h1m-1 6h1m-1 6h1"/></>,
    system: <><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8m-4-4v4M7 8h10m-10 4h6"/></>,
    gpu: <><rect x="2" y="5" width="20" height="13" rx="2"/><circle cx="10" cy="11.5" r="3.5"/><path d="M17 9v5M6 18v3m4-3v3"/></>,
  };
  return <svg className="module-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.overview}</svg>;
}

const pct = (v: number | null | undefined) => v == null ? "—" : `${v.toFixed(1)}%`;
const bytes = (v: number | null | undefined) => v == null ? "Not reported" : FORMAT_SIZE(v);
const energy = (v: number | null) => v == null ? "Not reported" : `${(v/1000).toFixed(2)} Wh`;
const uptime = (v: number) => `${Math.floor(v / 86400)}d ${Math.floor(v % 86400 / 3600)}h ${Math.floor(v % 3600 / 60)}m`;

export function Chart({ values, times, label }: { values: (number | null)[]; times: number[]; label: string }) {
  const width = 640, height = 150;
  const first = times[0] || 0, last = times[times.length-1] || first;
  const x = (i: number) => last > first ? (times[i]-first) / (last-first) * width : width;
  const segments: string[] = [];
  let current = "";
  values.forEach((value, i) => {
    if (value == null) { if (current) segments.push(current); current = ""; return; }
    const y = height - Math.min(100, Math.max(0,value)) / 100 * (height - 8) - 4;
    current += `${current ? " L" : "M"}${x(i).toFixed(1)},${y.toFixed(1)}`;
  });
  if (current) segments.push(current);
  const recent = values.filter((v): v is number => v != null);
  const average = recent.length ? recent.reduce((a,b)=>a+b,0)/recent.length : null;
  return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}. Current ${pct(values[values.length-1])}; recorded average ${pct(average)}.`} preserveAspectRatio="none"><g className="chart-grid">{[0,25,50,75,100].map(v=><line key={v} x1="0" y1={height-v/100*(height-8)-4} x2={width} y2={height-v/100*(height-8)-4}/>)}</g>{segments.map((d,i)=><path key={i} d={d} className="chart-line"/>)}{values.length===1 && values[0]!=null && <circle cx={width-3} cy={height-values[0]/100*(height-8)-4} r="3" className="chart-dot"/>}</svg><div className="chart-axis"><span>{times.length ? `${Math.round((last-first)/1000)}s recorded` : "Waiting for readings"}</span><span>0–100%</span><span>Now</span></div></div>;
}

function Meter({ value, label }: { value: number | null; label: string }) {
  return <div className="usage-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined} aria-valuetext={value == null ? "Not reported" : pct(value)}><span style={{ transform: `scaleX(${(value || 0)/100})` }}/></div>;
}

function Reading({ label, value, note, children }: { label: string; value: string; note: string; children?: React.ReactNode }) {
  return <article className="reading panel"><span className="reading-label">{label}</span><strong className="reading-value">{value}</strong><p>{note}</p>{children}</article>;
}

function Overview({ data, drives, onNavigate }: { data: MonitorData; drives: RootEntry[]; onNavigate: (module: Module)=>void }) {
  const s = data.snapshot;
  const [welcome, setWelcome] = useState(() => localStorage.getItem("syslume.welcome.seen") !== "yes");
  const ram = s && s.memory_total_bytes ? s.memory_used_bytes/s.memory_total_bytes*100 : null;
  const total = drives.reduce((a,d)=>a+d.total_bytes,0), free=drives.reduce((a,d)=>a+d.available_bytes,0);
  const gpu = s?.gpus[0];
  return <>
    {welcome && <section className="welcome-panel"><div><span className="overline">Clarity begins here</span><h2>Know your computer.<br/>Find your breathing room.</h2><p>Follow the workload, explore your storage, and understand the hardware behind it. Everything is read on this device.</p><button className="primary-action" onClick={()=>{localStorage.setItem("syslume.welcome.seen","yes");setWelcome(false);}}>Explore your system <span>→</span></button></div><img src="/images/syslume-welcome.webp" alt="A clear observation window overlooking an imagined Karakoram landscape"/></section>}
    <div className="system-card-grid">
      <button className="summary-card" onClick={()=>onNavigate("performance")}><span><Icon name="performance"/>Processor</span><strong>{pct(s?.cpu_percent)}</strong><small>{s?.cpu_name || "Waiting for Windows"}</small><Chart values={data.history.map(p=>p.cpu)} times={data.history.map(p=>p.time)} label="CPU usage"/><em>View performance <b>→</b></em></button>
      <button className="summary-card" onClick={()=>onNavigate("performance")}><span><Icon name="system"/>Memory</span><strong>{s ? bytes(s.memory_used_bytes) : "—"}</strong><small>{s ? `${bytes(s.memory_total_bytes)} installed · ${pct(ram)} in use` : "Waiting for Windows"}</small><Chart values={data.history.map(p=>p.ram)} times={data.history.map(p=>p.time)} label="Memory usage"/><em>Understand memory <b>→</b></em></button>
      <button className="summary-card compact" onClick={()=>onNavigate("storage")}><span><Icon name="storage"/>Storage</span><strong>{total ? bytes(free) : "—"}</strong><small>{total ? `free across ${drives.length} volumes` : "Choose a drive or folder"}</small><Meter value={total ? (total-free)/total*100 : null} label="Storage used"/><em>Explore your space <b>→</b></em></button>
      <button className="summary-card compact" onClick={()=>onNavigate("battery")}><span><Icon name="battery"/>Battery</span><strong>{s?.batteries.length ? pct(s.batteries[0].charge_percent) : s ? "No battery" : "—"}</strong><small>{s?.batteries[0]?.status || "Charge and health when supported"}</small><Meter value={s?.batteries[0]?.charge_percent ?? null} label="Battery charge"/><em>View battery health <b>→</b></em></button>
      <button className="summary-card compact" onClick={()=>onNavigate("gpu")}><span><Icon name="gpu"/>Graphics</span><strong>{pct(gpu?.utilization)}</strong><small>{gpu?.name || "Hardware readings when supported"}</small><Meter value={gpu?.utilization ?? null} label="Graphics use"/><em>Inspect graphics <b>→</b></em></button>
      <button className="summary-card compact" onClick={()=>onNavigate("system")}><span><Icon name="system"/>Your system</span><strong className="system-os">{s?.os || "Windows"}</strong><small>{s ? `${s.architecture} · uptime ${uptime(s.uptime_seconds)}` : "Complete hardware inventory"}</small><em>View specifications <b>→</b></em></button>
    </div>
    <button className="process-entry" onClick={()=>onNavigate("processes")}><Icon name="processes"/><span><strong>What’s using your resources?</strong><small>Inspect running applications and background processes.</small></span><b>Open processes →</b></button>
  </>;
}

function Performance({ s, data }: { s: MonitorSnapshot; data: MonitorData }) {
  const ram = s.memory_total_bytes ? s.memory_used_bytes/s.memory_total_bytes*100 : null;
  return <><div className="readings-grid two"><Reading label="Processor" value={pct(s.cpu_percent)} note={s.cpu_name}><Chart values={data.history.map(p=>p.cpu)} times={data.history.map(p=>p.time)} label="Processor utilization"/></Reading><Reading label="Memory in use" value={pct(ram)} note={`${bytes(s.memory_used_bytes)} of ${bytes(s.memory_total_bytes)}`}><Chart values={data.history.map(p=>p.ram)} times={data.history.map(p=>p.time)} label="Memory utilization"/></Reading></div><div className="explanation panel"><h2>What these readings mean</h2><p>{s.cpu_percent == null ? "The processor needs two samples to measure activity. The next reading will show its workload." : s.cpu_percent > 85 ? "Your processor is busy. If the graph stays high while the computer feels slow, check Processes to see which applications need the most attention." : "CPU usage shows how much work your processor is doing. Brief peaks when opening apps or working are normal."}</p><p>{ram != null && ram > 85 ? "Memory usage is high. Closing applications you no longer need may give active work more room." : "Memory holds the work your apps are doing now. Windows also uses available memory to keep frequently used data close at hand."}</p></div><details className="advanced panel"><summary>Per-core usage & memory details</summary><div className="core-grid">{s.core_percent.map((value,i)=><div key={i}><span>Logical processor {i+1}</span><b>{pct(value)}</b><Meter value={value} label={`Logical processor ${i+1}`}/></div>)}</div><dl className="spec-list"><div><dt>Physical cores</dt><dd>{s.physical_cores ?? "Not reported"}</dd></div><div><dt>Logical processors</dt><dd>{s.logical_cores}</dd></div><div><dt>Available memory</dt><dd>{bytes(Math.max(0,s.memory_total_bytes-s.memory_used_bytes))}</dd></div><div><dt>Committed beyond physical RAM</dt><dd>{bytes(s.swap_used_bytes)} of {bytes(s.swap_total_bytes)}</dd></div></dl></details></>;
}

function Battery({ s }: { s: MonitorSnapshot }) {
  if (!s.batteries.length) return <Empty title="Battery information" detail={s.battery_note}/>;
  return <>{s.batteries.map((b,i)=><section key={i} className="battery-section"><h2>{b.name}</h2><div className="readings-grid three"><Reading label="Current charge" value={pct(b.charge_percent)} note={b.status}><Meter value={b.charge_percent} label="Current charge"/></Reading><Reading label="Battery health" value={pct(b.health_percent)} note="Full-charge capacity compared with original design"><Meter value={b.health_percent} label="Battery health"/></Reading><Reading label="Capacity lost" value={pct(b.wear_percent)} note="Estimated wear reported by your battery's capacities"/></div><div className="explanation panel"><h3>Charge and health are different</h3><p>Charge is how full the battery is today. Health is how much energy it can hold compared with when it was new. Capacity estimates can change as the battery calibrates.</p><p>{b.note}</p></div><details className="advanced panel"><summary>Capacity & charging details</summary><dl className="spec-list"><div><dt>Design capacity</dt><dd>{energy(b.design_mwh)}</dd></div><div><dt>Full-charge capacity</dt><dd>{energy(b.full_charge_mwh)}</dd></div><div><dt>Remaining energy</dt><dd>{energy(b.remaining_mwh)}</dd></div><div><dt>Charge cycles</dt><dd>{b.cycle_count ?? "Not reported"}</dd></div><div><dt>Power status</dt><dd>{b.status}</dd></div></dl></details></section>)}<p className="data-note">{s.battery_note}</p></>;
}

function Processes({ s }: { s: MonitorSnapshot }) {
  const [search,setSearch]=useState("");
  const [sort,setSort]=useState<"cpu"|"memory"|"name">("cpu");
  const [ascending,setAscending]=useState(false);
  const rows=useMemo(()=>[...(s.processes||[])].filter(p=>p.name.toLowerCase().includes(search.toLowerCase()) || String(p.pid).includes(search)).sort((a,b)=>{
    const value=sort==="name" ? a.name.localeCompare(b.name) : sort==="cpu" ? (a.cpu_percent??-1)-(b.cpu_percent??-1) : a.memory_bytes-b.memory_bytes;
    return (ascending ? value : -value) || a.pid-b.pid;
  }),[s.processes,search,sort,ascending]);
  const sortBy=(next:typeof sort)=>{if(next===sort)setAscending(v=>!v);else{setSort(next);setAscending(next==="name");}};
  return <><div className="process-tools"><label>Search processes<input type="search" placeholder="Application name or process ID" value={search} onChange={e=>setSearch(e.target.value)}/></label><span>{rows.length} of {s.processes?.length ?? 0} processes</span></div><p className="data-note">CPU is a share of the whole computer (0–100%). Memory is the process working set; shared pages may appear in more than one process. Initial CPU samples show —.</p><div className="process-table-wrap panel"><table className="process-table"><thead><tr><th aria-sort={sort==="name"?(ascending?"ascending":"descending"):"none"}><button onClick={()=>sortBy("name")}>Name {sort==="name"?(ascending?"↑":"↓"):""}</button></th><th>PID</th><th aria-sort={sort==="cpu"?(ascending?"ascending":"descending"):"none"}><button onClick={()=>sortBy("cpu")}>CPU {sort==="cpu"?(ascending?"↑":"↓"):""}</button></th><th aria-sort={sort==="memory"?(ascending?"ascending":"descending"):"none"}><button onClick={()=>sortBy("memory")}>Memory {sort==="memory"?(ascending?"↑":"↓"):""}</button></th></tr></thead><tbody>{rows.map(p=><tr key={p.pid}><td>{p.name}</td><td>{p.pid}</td><td>{pct(p.cpu_percent)}</td><td>{bytes(p.memory_bytes)}</td></tr>)}</tbody></table>{!rows.length&&<Empty title={s.processes ? "No matching processes" : "Reading processes"} detail={s.processes ? "Try a different name or process ID." : "Windows is preparing the next process snapshot."}/>}</div></>;
}

function SystemInfo({ s }: { s: MonitorSnapshot }) {
  const [search,setSearch]=useState("");
  const groups=s.specifications.filter(g=>`${g.name} ${g.fields.flat().join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  return <><div className="readings-grid three"><Reading label="Operating system" value={s.os} note={s.architecture}/><Reading label="Processor" value={`${s.physical_cores ?? "—"} cores`} note={s.cpu_name}/><Reading label="Installed memory" value={bytes(s.memory_total_bytes)} note={`${s.logical_cores} logical processors · uptime ${uptime(s.uptime_seconds)}`}/></div><label className="spec-search">Find a specification<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search hardware, Windows, firmware…"/></label><div className="inventory-grid">{groups.map((g,i)=><details className="advanced panel" key={`${g.name}-${i}`} open={search ? true : undefined}><summary>{g.name}<span>{g.fields.length} details</span></summary><dl className="spec-list">{g.fields.map(([label,value])=><div key={label}><dt>{label.replace(/([a-z])([A-Z])/g,"$1 $2")}</dt><dd>{value}</dd></div>)}</dl></details>)}</div>{!groups.length&&<Empty title="No matching specifications" detail="Try a broader hardware or Windows term."/>}<p className="data-note">Inventory is read at startup using Windows Management Instrumentation. Firmware fields and some hardware details depend on what the manufacturer reports.</p></>;
}

function Graphics({ s, data }: { s: MonitorSnapshot; data: MonitorData }) {
  if (!s.gpus.length) return <Empty title="Graphics information unavailable" detail={s.gpu_note}/>;
  return <>{s.gpus.map(g=><section className="gpu-section" key={g.id}><h2>{g.name}</h2><div className="readings-grid three"><Reading label="GPU utilization" value={pct(g.utilization)} note="Busiest engine across this adapter"><Chart values={data.history.map(p=>p.gpu[g.id]??null)} times={data.history.map(p=>p.time)} label={`${g.name} usage`}/></Reading><Reading label="Dedicated memory" value={bytes(g.dedicated_used_bytes)} note={g.dedicated_total_bytes ? `${bytes(g.dedicated_total_bytes)} dedicated capacity` : "No separate dedicated memory pool reported"}><Meter value={g.dedicated_used_bytes!=null&&g.dedicated_total_bytes ? g.dedicated_used_bytes/g.dedicated_total_bytes*100 : null} label="Dedicated GPU memory"/></Reading><Reading label="Shared memory" value={bytes(g.shared_used_bytes)} note={`Up to ${bytes(g.shared_limit_bytes)} of system RAM available`}/></div><p className="data-note">{g.note}</p><details className="advanced panel"><summary>Engine activity & hardware metrics</summary><div className="core-grid">{g.engines.map((e,i)=><div key={i}><span>{e.name}</span><b>{pct(e.utilization)}</b><Meter value={e.utilization} label={e.name}/></div>)}</div>{!g.engines.length&&<p className="data-note">No active engine readings were returned in this sample.</p>}<dl className="spec-list"><div><dt>Temperature</dt><dd>Not exposed by this provider</dd></div><div><dt>Fan speed, clocks & power</dt><dd>Not exposed by this provider</dd></div></dl></details></section>)}<div className="explanation panel"><h3>Graphics use has several parts</h3><p>Rendering, video decoding and copying data use different engines. Overall usage shows the busiest one, rather than adding every engine together.</p><p>{s.gpu_note}</p></div></>;
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <section className="system-empty panel"><Icon name="system"/><h2>{title}</h2><p>{detail}</p></section>;
}

export default function SystemWorkspace({ module, data, drives, onNavigate }: { module: Module; data: MonitorData; drives: RootEntry[]; onNavigate: (module:Module)=>void }) {
  const selected=MODULES.find(m=>m.id===module)!;
  const s=data.snapshot;
  return <div className="system-workspace"><header className="system-heading"><div><span className="overline">System intelligence</span><h1>{module==="overview" ? "Your computer, clearly." : selected.title}</h1><p>{selected.detail}</p></div><span className="reading-status"><i className={data.paused||data.hidden||data.error ? "idle" : ""}/>{!data.native ? "Desktop readings" : data.paused ? "Paused" : data.hidden ? "Paused while hidden" : data.error ? "Readings interrupted" : s ? `Updated ${new Date(s.sampled_at).toLocaleTimeString()}` : "Reading Windows…"}</span></header>
    {!data.native&&<div className="inline-notice" role="status">Live hardware readings are available in the Windows desktop app. This browser shows the interface without simulated data.</div>}
    {data.error&&<div className="inline-notice" role="alert"><strong>Windows readings are interrupted.</strong> {data.error} {s&&"The last successful readings remain visible."}</div>}
    {module==="overview" ? <Overview data={data} drives={drives} onNavigate={onNavigate}/> : !s ? <Empty title={data.native ? "Preparing your first readings" : "Open Syslume on Windows"} detail={data.native ? "Windows is returning hardware information. You can continue exploring the other sections." : "This module reads real hardware through the desktop app."}/> : module==="performance" ? <Performance s={s} data={data}/> : module==="battery" ? <Battery s={s}/> : module==="processes" ? <Processes s={s}/> : module==="system" ? <SystemInfo s={s}/> : <Graphics s={s} data={data}/>}
  </div>;
}
