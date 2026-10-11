# DiskSight → Syslume: audit and implementation brief

Audit date: 11 October 2026. Status: existing application inspected; visual concepts awaiting the user's selection. This document describes current code and proposed changes, not completed monitoring features.

## Existing architecture

The project is a Tauri 2 Windows desktop application with a React 19 / TypeScript frontend and a Rust backend. Vite builds the frontend; styling lives in `src/App.css`. Tailwind 4 packages are installed, but the UI primarily uses handwritten CSS. Keep this stack.

`src/App.tsx` owns drive discovery, scan lifecycle, incremental tree reconstruction, settings, local scan history, theme, and notifications. It routes between home, scanning, and storage results. React StrictMode is enabled in `src/main.tsx`.

The existing views are `HomeView`, `ScanningView`, `DashboardView`, and `SettingsView`. The storage workspace has overview, explorer, cleanup, duplicate, and history tabs. Search is capped at 1,000 displayed matches. CSV/JSON exports use a Blob download. Settings and the last 24 summaries are stored in browser localStorage under DiskSight keys.

Rust exposes commands in `src-tauri/src/lib.rs`. `scan/commands.rs` starts scan threads and exposes drives, duplicates, file details, Explorer integration, and cleanup. `scan/engine.rs` uses the `ignore` walker, accumulates file and ancestor sizes, handles cancellation, and emits batched events. `scan/state.rs` retains scan state and completed summaries in mutex-protected maps. `scan/delete.rs` classifies paths and uses the `trash` crate for the active cleanup flow.

Existing dependencies already include `sysinfo 0.38.0`, serde, ignore, uuid, trash, and sha2. Reuse sysinfo for CPU, memory, disks, and processes. Do not add a second frontend framework, chart framework, or heavyweight sensor service merely for presentation.

## Feature inventory

| Requested module | Existing implementation | Work required |
| --- | --- | --- |
| Storage | Drives, folder selection, scan options, largest files/folders, file categories, age, search, exports, duplicates, cleanup review, local history | Add an actual interactive area-proportional treemap with drill-down, breadcrumbs, keyboard access, and an equivalent list; repair lifecycle and filtering defects |
| CPU and RAM | sysinfo dependency exists; no monitoring commands or UI | Persistent sampled collector, aggregate and per-core CPU, memory and swap, bounded history, plain explanations |
| Battery | No collector or UI | Native Windows battery discovery, charge/status, design and full-charge capacity, health/wear, explicit unsupported states |
| Processes | No collector or UI | Running-process snapshots with PID, name, normalized CPU and memory; sortable/searchable accessible list |
| System | No hardware-information module | Cached Windows/hardware inventory with advanced details and honest unavailable fields |
| GPU | No collector or UI | Adapter discovery and identity, native performance-counter sampling, dedicated/shared memory, per-adapter capability reporting |

The README and screenshot guide mention a treemap, but the current `DashboardView` renders a ranked folder list with bars. No treemap component exists in the audited source.

## Defects and risks found in source

1. **Fatal scan errors are indistinguishable from recoverable entry warnings.** The backend removes failed scans and emits `scan://error`; the frontend only adds a warning and remains in the scanning view. Add an explicit failure terminal event/state.
2. **Async event-listener setup can leak listeners under StrictMode.** Effect cleanup runs before all awaited registrations necessarily complete. Start scans only after registration is ready; dispose late registrations safely and handle setup rejection.
3. **Tree reconstruction depends on parent arrival order.** A child is attached only when the parent already exists. Repair attachment for delayed parents and verify completion after all tree batches.
4. **The hidden-item setting is overridden.** `builder.hidden(!options.include_hidden)` is followed by `builder.standard_filters(false)`. The installed ignore implementation resets `hidden` inside `standard_filters`, so the setting is not effective. Windows hidden attributes also need an explicit supported policy.
5. **The registered legacy `delete_path` command permits permanent deletion.** The current UI uses the trash-only command, but the public IPC command still has a `to_trash=false` path. Enforce the trash-only promise throughout the backend. Validate canonical paths/reparse points before applying protected-path policy.
6. **Cleanup selection can be incomplete in its final review.** Duplicate discovery walks separately using different traversal defaults. The review drawer resolves selected paths only against the original scan's file list, while the confirmation submits the complete selection. Require every submitted item to appear in the review with backend-verified metadata.
7. **Trash movement is described as freed space.** Moving a file to the same volume's Recycle Bin does not necessarily increase available volume capacity. Report bytes moved; refresh actual free space independently.
8. **Several heavy commands run synchronously.** Duplicate hashing and recursive size operations should use bounded blocking work with clear busy/error states and cancellation where appropriate.
9. **Cancellation is checked only every 5,000 entries.** Improve responsiveness without emitting excessive events; guard against overlapping scans and an old scan winning navigation.
10. **The frontend copies the entire node map for each batch.** Ancestor updates and large result trees need profiling and coalescing. The backend retains completed results without a retention limit. Bound retained state.
11. **Drawer accessibility is incomplete.** Add dialog semantics, focus placement/trap/return, Escape handling, named close buttons, and focusable table actions. The current Open/Review actions are click handlers on `em` elements inside row buttons.
12. **Small type and fixed minimum width reduce accessibility.** Numerous labels are around 9–11px; body has `min-width:900px`. Verify readability, contrast, 125–200% scaling, window resizing, high contrast, and reduced motion.
13. **System theme is read once per settings update.** Subscribe to OS preference changes while system mode is selected.
14. **Some errors escape into unhandled promises.** Folder picker, cleanup, cancellation, and Explorer calls need actionable inline failures and retry paths.
15. **Names are scattered across runtime and packaging.** UI, exports, HTML, Cargo package/library, Tauri product/title, release workflow, README, local-storage keys, and icons need a coordinated migration. The checked-in DiskSight installer is a historical binary, not a renamed Syslume build.

## In-place implementation design

Keep the storage engine, its commands, safe cleanup review, settings, and history. Fix the issues above with focused regression tests rather than replacing them. Add a sibling Rust `monitor` module with typed serializable snapshots and native Windows adapters. Register its commands alongside the storage commands.

Use one persistent sysinfo System instance so CPU/process readings represent intervals rather than a new initial sample every refresh. Normalize process CPU against logical processors for a clearly labeled 0–100% whole-machine view; offer advanced per-core-equivalent usage only with explanation. Distinguish the initial CPU warm-up sample from zero activity.

Use a shared React monitoring hook/store with a single non-overlapping request schedule and bounded chart history. Avoid separate polls in every card. Cache slow hardware inventory, sample active CPU/RAM/process views at about two seconds, and battery capacity at a much slower interval. Pause or reduce work when the window is hidden; offer pause and update-interval controls. These are proposed settings, not measured performance claims.

For battery, use Windows battery-device information/status APIs, with supported WMI information where useful. Compute wear only when valid design and full-charge values use comparable units. Unknown values remain null; desktops show “No battery detected.” Do not substitute charge percentage for battery health.

For GPU, discover hardware with DXGI/WMI and sample Windows GPU Engine/GPU Adapter Memory counters using native PDH where supported. Associate engine instances with adapter identity; aggregate processes per physical engine, then select the busiest engine for an overall utilization summary. Do not blindly sum all engines or per-process shared-memory values. A static adapter name is not live GPU monitoring. Temperature, fan speed, clocks, and power remain explicitly unavailable unless a supported provider supplies them.

The proposed UI opens on a concise system overview with six module destinations: Storage, Performance, Battery, Processes, System, and Graphics. Each starts with readable values, clear units, a small chart or breakdown, and a short explanation. Advanced inventory, per-core/per-engine detail, and raw paths use disclosure controls. Existing storage subviews remain reachable within Storage.

Use local Segoe UI Variable/Segoe UI for monitoring text, tabular figures for readings, pine/jade accents, quiet stone surfaces, and brass sparingly. Favor bounded SVG/canvas charts, short opacity/transform transitions, visible focus, explicit live/stale/error states, and reduced-motion support. Keep artwork off live monitoring charts.

## Name and data migration

Rename product-visible text and package/build output consistently to Syslume. Migrate legacy localStorage settings/history before writing new Syslume keys, preserving a fallback copy until migration is verified. Assess Tauri identifier/installer upgrade identity before changing them: changing the app origin or installer identity without migration can strand existing data or create a second installation. Produce and inspect an actual Syslume installer; renaming an old `.exe` is not a product migration. Final icon assets depend on the user's logo selection.

## Validation and current evidence

- Initial working tree was clean.
- `npm run build` passed: 38 transformed modules; production CSS 29.10 KB / gzip 6.62 KB; JS 226.86 KB / gzip 70.42 KB. This verifies compilation, not native functionality.
- The first `cargo test --manifest-path src-tauri/Cargo.toml` attempt failed in Tauri's build script due to permissions metadata pointing at the previous `D:\DiskSight\DiskSight` location.
- A clean build/test retry uses the ignored `src-tauri/target/syslume-audit` directory. See `VALIDATION.md` for the final result.
- Browser inspection confirmed the home view, theme, and settings controls render. The preview cannot execute Tauri IPC; zero drives in that browser is not evidence of a native drive-discovery failure. The side-panel screenshot surface clipped the desktop layout, so it does not establish desktop visual correctness.
- Existing Rust tests cover size aggregation, last-extension extraction, cancellation, and event payload serialization. There are no frontend test scripts, battery tests, GPU tests, monitoring tests, or performance benchmarks in the audited project.

Required implementation verification: scan success/failure/cancel races, hidden/system/exclusion settings, accurate treemap areas, exact duplicate review, protected-path and trash-only enforcement, migration, known hardware readings against Windows tools, unsupported batteries/counters, multi-adapter mapping, memory/CPU warm-up, stale/error behavior, chart retention, polling pause, keyboard dialogs and navigation, light/dark themes, scaling, native app smoke test, and installer metadata. Measure resource usage before making lightweight-performance claims.

## Visual approval boundary

Ten logo concepts and three storytelling images are stored only under `docs/syslume/concepts`. They are review artifacts, excluded from application imports and runtime branding. The user must select a logo and approve individual illustrations before integration. After selection, refine the chosen mark into a clean small-size vector and Windows icon set rather than shipping a presentation board as an app icon.

The initial audit ended at the visual approval checkpoint. The later approval and implementation outcome are recorded below.

## Implemented outcome
The existing React/Tauri stack and storage engine were retained. Six modules, proportional treemap, native worker, polling controls, approved logo/A artwork, rename/migration, accessibility and safety fixes are implemented. See VALIDATION.md for verified results and platform limitations. The user approved shipping after selecting original 03 and A; no other storytelling assets are integrated.
