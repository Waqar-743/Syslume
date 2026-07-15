# DiskSight

DiskSight is a Windows storage intelligence and safe-cleanup desktop app built with Tauri 2, Rust, React 19, and TypeScript.

## What version 1.0 includes

- Drive and custom-folder scanning
- Configurable scan depth, hidden files, system directories, symbolic links, mount boundaries, and exclusions
- Size, file type, age, and directory analysis
- Searchable explorer with file metadata and export to CSV or JSON
- Explainable cleanup suggestions collected into a final review
- Trash-only cleanup with protected paths enforced by Rust
- Exact duplicate detection using size grouping and SHA-256 verification
- Local scan history with storage-change comparisons
- Light, dark, and system themes

DiskSight never silently falls back from trash to permanent deletion. Cleanup suggestions are recommendations, not automatic actions.

## Development

Requirements: Node.js 18+, Rust stable, Microsoft WebView2, and the Windows C++ build tools.

```powershell
npm install
npm run tauri dev
```

Production build:

```powershell
npm run build
npm run tauri -- build --bundles nsis
```

The NSIS installer is written to `src-tauri/target/release/bundle/nsis/`.

## Architecture

- `src/` contains the React workspace and persistent user preferences/history.
- `src-tauri/src/scan/engine.rs` performs filesystem traversal and emits incremental results.
- `src-tauri/src/scan/delete.rs` classifies protected paths and performs trash-only cleanup.
- `src-tauri/src/scan/commands.rs` exposes scanning, cleanup, file-manager, and duplicate-analysis commands.

## License

MIT. See [LICENSE](LICENSE).
