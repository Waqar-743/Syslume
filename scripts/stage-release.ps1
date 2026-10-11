param([switch]$MsiOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$config = Get-Content (Join-Path $projectRoot 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
$targetDirectory = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $projectRoot 'src-tauri/target' }
$executable = Join-Path $targetDirectory 'release/syslume.exe'
$installerName = "$($config.productName)_$($config.version)_x64-setup.exe"
$installer = Join-Path $targetDirectory "release/bundle/nsis/$installerName"
$msiName = "$($config.productName)_$($config.version)_x64_en-US.msi"
$msi = Join-Path $targetDirectory "release/bundle/msi/$msiName"
if (-not (Test-Path -LiteralPath $msi -PathType Leaf)) { throw "Missing MSI artifact: $msi" }
$msiReader = New-Object -ComObject WindowsInstaller.Installer
$database = $msiReader.OpenDatabase($msi, 0)
$view = $database.OpenView('SELECT `Property`, `Value` FROM `Property`')
$view.Execute() | Out-Null
$properties = @{}
while ($record = $view.Fetch()) { $properties[$record.StringData(1)] = $record.StringData(2) }
$view.Close() | Out-Null
if ($properties.ProductName -ne $config.productName -or $properties.ProductVersion -ne $config.version) {
    throw "Unexpected product/version in $msi"
}
if ([Guid]$properties.UpgradeCode -ne [Guid]$config.bundle.windows.wix.upgradeCode) {
    throw "Unexpected MSI upgrade identifier in $msi"
}
# Release COM database handles before copying or uploading the MSI.
$record = $view = $database = $msiReader = $null
[GC]::Collect()
[GC]::WaitForPendingFinalizers()
$outputDirectory = Join-Path $projectRoot 'release'
$executablesToValidate = if ($MsiOnly) {
    @((Join-Path $outputDirectory 'Syslume.exe'), (Join-Path $outputDirectory $installerName))
} else { @($executable, $installer) }
foreach ($source in $executablesToValidate) {
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing release artifact: $source" }
    $version = (Get-Item -LiteralPath $source).VersionInfo
    if ($version.ProductName -ne $config.productName -or $version.ProductVersion -notlike "$($config.version)*") {
        throw "Unexpected product/version in $source"
    }
}
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
if (-not $MsiOnly) {
    Copy-Item -LiteralPath $executable -Destination (Join-Path $outputDirectory 'Syslume.exe') -Force
    Copy-Item -LiteralPath $installer -Destination (Join-Path $outputDirectory $installerName) -Force
}
Copy-Item -LiteralPath $msi -Destination (Join-Path $outputDirectory $msiName) -Force
$files = @('Syslume.exe', $installerName, $msiName)
$checksums = foreach ($name in $files) {
    $hash = Get-FileHash -LiteralPath (Join-Path $outputDirectory $name) -Algorithm SHA256
    "$($hash.Hash.ToLowerInvariant())  $name"
}
$checksums | Set-Content -LiteralPath (Join-Path $outputDirectory 'SHA256SUMS.txt') -Encoding ascii
Get-Item -LiteralPath @($files | ForEach-Object { Join-Path $outputDirectory $_ }) | Select-Object Name, Length, FullName
