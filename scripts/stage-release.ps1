$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$config = Get-Content (Join-Path $projectRoot 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
$targetDirectory = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $projectRoot 'src-tauri/target' }
$executable = Join-Path $targetDirectory 'release/syslume.exe'
$installerName = "$($config.productName)_$($config.version)_x64-setup.exe"
$installer = Join-Path $targetDirectory "release/bundle/nsis/$installerName"
foreach ($source in @($executable, $installer)) {
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing release artifact: $source" }
    $version = (Get-Item -LiteralPath $source).VersionInfo
    if ($version.ProductName -ne $config.productName -or $version.ProductVersion -notlike "$($config.version)*") {
        throw "Unexpected product/version in $source"
    }
}
$outputDirectory = Join-Path $projectRoot 'release'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
Copy-Item -LiteralPath $executable -Destination (Join-Path $outputDirectory 'Syslume.exe') -Force
Copy-Item -LiteralPath $installer -Destination (Join-Path $outputDirectory $installerName) -Force
$files = @('Syslume.exe', $installerName)
$checksums = foreach ($name in $files) {
    $hash = Get-FileHash -LiteralPath (Join-Path $outputDirectory $name) -Algorithm SHA256
    "$($hash.Hash.ToLowerInvariant())  $name"
}
$checksums | Set-Content -LiteralPath (Join-Path $outputDirectory 'SHA256SUMS.txt') -Encoding ascii
Get-Item -LiteralPath @($files | ForEach-Object { Join-Path $outputDirectory $_ }) | Select-Object Name, Length, FullName
