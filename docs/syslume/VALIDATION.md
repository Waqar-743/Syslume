# Syslume 1.1 validation

Validated on Windows 11 Pro build 22000, Intel i5-8365U (4 physical / 8 logical cores), 8 GB RAM, Intel UHD Graphics 620 and a Dell battery. Evidence describes this PC; multi-adapter and battery-free machines were not available for physical testing.

## Automated checks

- `npm test`: proportional treemap areas, bounds, non-overlapping rectangles, 1,000-node layout, empty and invalid data passed.
- `npm run build`: TypeScript and Vite production compilation passed. Final JS 256.13 KB / 79.13 KB gzip; CSS 51.58 KB / 11.05 KB gzip.
- Final native unit tests: eight passed, covering size aggregation, cancellation, extensions, hidden/exclusion settings, event serialization, exact-content duplicates, capacity health and cleanup confirmation/protection. The live-hardware test is excluded from this deterministic run.
- Explicit live-hardware test passed: nonzero RAM, valid CPU range, running process list, valid GPU utilization range, battery and WMI inventory. Initial readings are intentionally unavailable until a usable sampling interval exists.
- `npm audit` after dependency updates: zero reported vulnerabilities. Rust dependency advisory scanning has not been performed.

## Native evidence

Two snapshots produced CPU usage and eight per-core readings. Total RAM was 8,391,184,384 bytes, matching `Win32_ComputerSystem.TotalPhysicalMemory`. Running processes returned names, PIDs, working sets and CPU fractions normalized by logical CPU count.

Battery full-charge capacity was 35,895 mWh, matching a separate `BatteryFullChargedCapacity` query. Design capacity was 60,002 mWh; computed health was 59.82% and wear 40.18%. Remaining capacity and discharging status were returned. Cycle count was not reported and remains unavailable.

DXGI identified Intel UHD Graphics 620. Windows counters returned dedicated/shared memory and engine samples. The separate Windows GPU Engine counter query also reported no activity above 0.01% during the idle sample. This verifies available counters and idle reporting; it is not a controlled GPU load benchmark.

Ten inventory groups include Windows build/version, processor, RAM modules, board, firmware, disks, graphics driver, network and audio. Driver access or missing WMI fields produce explicit unavailable values.

## Build notes

The original target cache referenced a previous checkout path. Local validation uses `src-tauri/target/syslume-audit` via `CARGO_TARGET_DIR`, with one build job on this 8 GB PC. Cargo test harnesses initially failed before startup because they lacked the Common Controls activation manifest; `scripts/test-native.ps1` supplies a sidecar manifest. The actual Tauri app embeds its manifest normally.

The selected mark is traced as SVG and rendered into Windows ICO/PNG assets. The approved A illustration was recolored with image generation, then encoded as WebP for the welcome placement. Rejected B and C assets are not imported or bundled.

## Native desktop smoke checks

The optimized Windows executable opened successfully with the selected woven mark. The first-run welcome showed only approved A; its action dismissed the panel. Native navigation exposed CPU/RAM graphs, battery charge/health/wear, GPU utilization and dedicated/shared memory, running processes and Windows/hardware disclosures. Initial process CPU samples displayed unavailable values, followed by usable interval samples. Searching for `syslume` returned the app's process. Windows inventory expanded to build 22000.

The Windows folder picker selected a disposable fixture with 125 files, four folders including the root, and 22,536,192 bytes. The UI reported 125 files / four folders / 21.5 MB, consistent with the expected total. Treemap drilling entered Documents; its accessible list exposed 100 items on page one and the remaining 21 on page two. The duplicate scan found the expected two 10 MB copies, kept the first, and queued only the extra copy. Final cleanup review contained only that file. Escape closed review without deletion; a subsequent filesystem check confirmed all 125 files and the original total remained.

Existing DiskSight history appeared in Syslume through the migration fallback. Native settings switched between light and dark; Escape dismissed settings and visibly returned focus to its opener. The final visual pass corrected overview density for laptop screens, long-path review overflow, duplicate-button text contrast, search clear-control color and the scanning emblem. Search fields inherit disabled spellchecking to avoid Windows dictionary underlines on process names and paths.

## Packaging and remaining validation limits

The final optimized x64 NSIS bundle was rebuilt successfully after the visual corrections. Executable and installer metadata were checked before staging: Syslume / 1.1.0. `release/Syslume.exe` is 12,330,496 bytes; `release/Syslume_1.1.0_x64-setup.exe` is 2,896,138 bytes. `release/SHA256SUMS.txt` records hashes for both. The installer is unsigned (`Get-AuthenticodeSignature`: NotSigned).

The staged executable opened successfully. Native inspection confirmed the compact six-summary overview in both light and dark appearances. A further C: scan result was observed in the running app: 92,082 files / 15,137 folders, with six access warnings. This was an observed user-run result, not an independently reconciled disk-size benchmark.

### Runtime resource samples

`scripts/measure-syslume.ps1` measures Syslume plus its WebView2 descendants. CPU is a share of all eight logical processors. Working-set sums can count shared pages more than once; private commit is not a direct measurement of physical RAM usage.

| State | Duration | Whole-computer CPU | Private commit | Summed working sets |
| --- | --- | --- | --- | --- |
| Minimized | 15.13 s | 0.00% rounded | 387.8 MiB | 626.1 MiB |
| Visible overview | 15.19 s | 3.29% | 284.8 MiB | 491.7 MiB |
| Further visible overview sample | 15.18 s | 4.12% | 283.6 MiB | 490.7 MiB |

Live reading timestamps advanced during visible inspection. Chart history remained bounded at about two minutes with the two-second interval. The minimized sample confirms that hidden-window polling stops. These short samples include browser/driver costs and desktop inspection; they are not controlled throughput, battery-life or power benchmarks. The app provides two-, five- and ten-second refresh options and a pause control. Raw samples are under `release/verification/`.

Physical testing covers this Windows 11 PC. Windows 10, multiple GPUs, battery-free hardware, controlled CPU/GPU load benchmarks, very large disk-scan benchmarks, installer installation/upgrade, and screen-reader/high-DPI/high-contrast testing were not performed. Actual Recycle Bin deletion was not exercised in the UI. Export compilation is verified; native CSV/JSON download behavior still needs a separate manual check. Unsupported temperature, fan, clock, power and cycle-count fields remain explicitly unavailable.

### MSI installer

The additional `Syslume_1.1.0_x64_en-US.msi` was packaged successfully from the existing optimized build using `tauri bundle --bundles msi --ci`. It is 4,747,264 bytes. Read-only Windows Installer database inspection confirmed ProductName `Syslume`, ProductVersion `1.1.0`, x64 architecture, and an embedded `syslume.exe` of 12,330,496 bytes with file version `1.1.0.0`. The MSI retains upgrade identifier `b032836f-59f8-54b7-ad17-7711558cf33e`, independently read from the previous DiskSight 1.0 MSI. This preserves the installer upgrade family; installation and upgrade behavior were not exercised.

The MSI uses the approved mark with forest/ivory banner and dialog artwork. It is unsigned. The staging script now validates MSI product/version and upgrade metadata and includes the MSI in `SHA256SUMS.txt`. The already published EXE installer and standalone executable were retained with their original hashes. The release workflow builds both installer formats for future versions.
