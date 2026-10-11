param([int]$AppProcessId, [int]$Seconds = 15)
$ErrorActionPreference = 'Stop'
if (-not $AppProcessId) {
    $running = @(Get-Process syslume -ErrorAction Stop)
    if ($running.Count -ne 1) { throw 'Specify the Syslume process ID when multiple instances are running.' }
    $AppProcessId = $running[0].Id
}
function Read-AppProcesses {
    $all = @(Get-CimInstance Win32_Process)
    $ids = [Collections.Generic.HashSet[int]]::new()
    [void]$ids.Add($AppProcessId)
    do {
        $added = $false
        foreach ($item in $all) {
            if ($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)) { $added = $true }
        }
    } while ($added)
    @(Get-Process -Id @($ids) -ErrorAction SilentlyContinue)
}
$before = @{}
foreach ($item in (Read-AppProcesses)) { $before[$item.Id] = $item.TotalProcessorTime.TotalSeconds }
$clock = [Diagnostics.Stopwatch]::StartNew()
Start-Sleep -Seconds $Seconds
$after = @(Read-AppProcesses)
$elapsed = $clock.Elapsed.TotalSeconds
$cpuSeconds = 0.0
foreach ($item in $after) {
    if ($before.ContainsKey($item.Id)) { $cpuSeconds += [Math]::Max(0, $item.TotalProcessorTime.TotalSeconds - $before[$item.Id]) }
}
$logical = [Environment]::ProcessorCount
[ordered]@{
    sampledSeconds = [Math]::Round($elapsed, 2)
    logicalProcessors = $logical
    processCount = $after.Count
    averageWholeComputerCpuPercent = [Math]::Round($cpuSeconds / $elapsed / $logical * 100, 2)
    summedWorkingSetMiB = [Math]::Round(($after | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 1)
    privateCommitMiB = [Math]::Round(($after | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB, 1)
    includes = 'Syslume and its WebView2 descendants; working sets can double-count shared pages.'
    processes = @($after | Select-Object Id, ProcessName, WorkingSet64, PrivateMemorySize64)
} | ConvertTo-Json -Depth 4
