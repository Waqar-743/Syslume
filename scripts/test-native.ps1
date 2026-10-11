param([switch]$LiveHardware)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$manifest = Join-Path $projectRoot 'src-tauri/Cargo.toml'
$artifacts = & cargo test --manifest-path $manifest --jobs 1 --no-run --message-format=json
if ($LASTEXITCODE -ne 0) { throw 'Native test compilation failed.' }
foreach ($line in $artifacts) {
    try { $artifact = $line | ConvertFrom-Json } catch { continue }
    if ($artifact.reason -eq 'compiler-artifact' -and $artifact.profile.test -and $artifact.executable) {
        # Tauri embeds resources into its app binary; Cargo library test harnesses
        # need the same Common Controls activation context as a sidecar manifest.
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'native-test.manifest') -Destination ($artifact.executable + '.manifest') -Force
        if ($LiveHardware) {
            & $artifact.executable live_windows_snapshot --ignored --nocapture
        } else {
            & $artifact.executable
        }
        if ($LASTEXITCODE -ne 0) { throw "Native tests failed: $($artifact.executable)" }
    }
}
