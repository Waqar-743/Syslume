<p align="center">
  <img src="docs/syslume/branding/syslume-icon.png" alt="Syslume woven logo" width="120" height="120" />
</p>
<h1 align="center">Syslume</h1>
<p align="center">Clarity for your Windows PC.<br />Explore storage, understand performance, and get to know your hardware.</p>
<p align="center">
  <a href="https://github.com/Waqar-743/Syslume/releases/latest">Download for Windows</a> ·
  <a href="docs/syslume/VALIDATION.md">Validation report</a> ·
  <a href="LICENSE">MIT license</a>
</p>

Syslume brings storage analysis, CPU and RAM monitoring, battery health, running processes, system information, and GPU readings into one Windows desktop workspace. It evolves the existing DiskSight application using Tauri 2, Rust, React 19, and TypeScript.

## Download

Get **Syslume 1.1.0** for Windows 10/11 x64:

- [Windows installer (.exe)](https://github.com/Waqar-743/Syslume/releases/download/v1.1.0/Syslume_1.1.0_x64-setup.exe)
- [Windows installer (.msi)](https://github.com/Waqar-743/Syslume/releases/download/v1.1.0/Syslume_1.1.0_x64_en-US.msi)
- [Standalone application (.exe)](https://github.com/Waqar-743/Syslume/releases/download/v1.1.0/Syslume.exe)
- [SHA-256 checksums](https://github.com/Waqar-743/Syslume/releases/download/v1.1.0/SHA256SUMS.txt)

Microsoft WebView2 is required. Both installers are unsigned and Windows may show a publisher warning. The standalone executable uses the same WebView2 runtime. This release was exercised on Windows 11; installer installation/upgrade and Windows 10 testing remain unverified. See the [validation report](docs/syslume/VALIDATION.md) for the tested hardware, measurements, and remaining checks.

## Version 1.1

- Live CPU and RAM readings, bounded usage graphs, per-core details and workload explanations
- Battery charge, charging state, capacity, health and wear when the driver reports them
- Searchable running processes with sortable CPU and working-set memory
- Windows, processor, RAM modules, motherboard, firmware, storage, display, network and audio inventory
- GPU utilization and dedicated/shared memory, mapped to physical DXGI adapters using Windows counters
- A proportional storage treemap with folder navigation and an accessible list
- Seven clear navigation destinations, light/dark/system themes, reduced motion and keyboard dialogs
- The approved woven logo and mountain welcome artwork in green, ivory, charcoal and brass

The original storage workflow remains available:

- Drive and custom-folder scanning
- Configurable scan depth, hidden files, system directories, symbolic links, mount boundaries, and exclusions
- Size, file type, age, and directory analysis
- Searchable explorer with file metadata and export to CSV or JSON
- Explainable cleanup suggestions collected into a final review
- Trash-only cleanup with protected paths enforced by Rust
- Exact duplicate detection using size grouping and SHA-256 verification
- Local scan history with storage-change comparisons
- Light, dark, and system themes

Syslume never falls back from the Recycle Bin to permanent deletion. Cleanup requires a final review, and protected system paths remain blocked even after confirmation. Moving items to the Recycle Bin does not immediately release disk space.

Monitoring uses real data only. Initial CPU samples and unavailable metrics show an em dash or an explanation. Battery capacities refresh every 30 seconds. GPU temperature, clocks, fan speed and power are not available through the current Windows counter provider. Desktop PCs without batteries receive a clear empty state. The browser preview cannot read native hardware.

Monitoring refreshes every 2, 5 or 10 seconds, pauses when hidden or manually paused, retains 60 chart samples and reads process details only while Processes is open. Inventory is cached at startup. Data stays on the device; there is no telemetry service.

## Development

Requirements: Windows 10/11 x64, Node.js 22+, Rust stable, Microsoft WebView2 and the Windows C++ build tools. GPU counters require a compatible WDDM driver.

```powershell
npm ci
npm run tauri dev
```

Production build:

```powershell
$env:CARGO_BUILD_JOBS = '1'
npm run tauri -- build --bundles nsis,msi
./scripts/stage-release.ps1
```

The EXE installer is written to `src-tauri/target/release/bundle/nsis/` and the MSI to `src-tauri/target/release/bundle/msi/` (or the configured `CARGO_TARGET_DIR`). The staging script verifies product/version metadata and the MSI upgrade identifier, then copies both installers, the standalone executable and SHA-256 checksums into `release/`. MSI packaging retains the previous DiskSight upgrade identifier; actual upgrade behavior still requires manual validation.

Verification:

```powershell
npm test
./scripts/test-native.ps1
./scripts/test-native.ps1 -LiveHardware
```

The native runner supplies the Common Controls manifest required by Tauri's Cargo test harnesses. The live test reads the current PC and is separate from deterministic unit tests. See `docs/syslume/VALIDATION.md` for evidence and limitations.

## Architecture

- `src/` contains the React workspace and persistent user preferences/history.
- `src-tauri/src/scan/engine.rs` performs filesystem traversal and emits incremental results.
- `src-tauri/src/scan/delete.rs` classifies protected paths and performs trash-only cleanup.
- `src-tauri/src/scan/commands.rs` exposes scanning, cleanup, file-manager, and duplicate-analysis commands.
- `src-tauri/src/monitor/` owns a dedicated worker for sysinfo, WMI, DXGI and PDH snapshots.
- `src/monitor.ts` manages polling and bounded chart history; `SystemWorkspace.tsx` renders the monitoring modules.
- `src/treemap.ts` implements proportional partitioning without an additional chart framework.

The existing application identifier `com.dell.disksight` is retained to preserve the WebView data origin. Installer upgrade behavior requires separate manual validation. Product names, window title, executable, package metadata, icons and reports use Syslume. Existing settings/history keys are read as a migration fallback and saved under Syslume keys.

## License

MIT. See [LICENSE](LICENSE).
