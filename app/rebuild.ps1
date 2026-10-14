# Rebuilds data\library.js from the folders in manga\.
# Unpacks any .cbz/.zip and converts any .pdf into a folder of the same name first
# (the original is deleted only after it unpacks/converts successfully).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root  = Split-Path -Parent $PSScriptRoot
$manga = Join-Path $root 'manga'
$data  = Join-Path $root 'data'
$img   = '\.(jpe?g|png|webp|gif|avif|bmp|svg)$'
New-Item -ItemType Directory -Force -Path $manga, $data | Out-Null

# Natural sort key: pad every number so "2" < "10" < "10.5" < "11".
function NatKey([string]$s) { [regex]::Replace($s, '\d+', { param($m) $m.Value.PadLeft(12, '0') }) }
function IsImage($f) { $f.Name -match $img -and $f.Name -notlike '.*' }

# --- 1. Unpack archives ---
foreach ($zip in @(Get-ChildItem -LiteralPath $manga -Recurse -File | Where-Object { $_.Extension -match '^\.(cbz|zip)$' })) {
    $dest = Join-Path $zip.DirectoryName $zip.BaseName
    if (Test-Path -LiteralPath $dest) { Write-Warning "Skipped $($zip.Name): a folder named '$($zip.BaseName)' already exists next to it."; continue }
    Write-Host "Unpacking $($zip.Name)"
    try {
        [IO.Compression.ZipFile]::ExtractToDirectory($zip.FullName, $dest)
        $mac = Join-Path $dest '__MACOSX'
        if (Test-Path -LiteralPath $mac) { Remove-Item -LiteralPath $mac -Recurse -Force }
        # Archive had everything inside one folder? Lift its contents up a level.
        $kids = @(Get-ChildItem -LiteralPath $dest -Force)
        if ($kids.Count -eq 1 -and $kids[0].PSIsContainer) {
            $tmp = Rename-Item -LiteralPath $kids[0].FullName -NewName '__unpack_tmp' -PassThru
            Get-ChildItem -LiteralPath $tmp.FullName -Force | Move-Item -Destination $dest
            Remove-Item -LiteralPath $tmp.FullName -Force
        }
        $n = @(Get-ChildItem -LiteralPath $dest -Recurse -File | Where-Object { IsImage $_ }).Count
        if ($n -gt 0) { Remove-Item -LiteralPath $zip.FullName -Force }
        else { Write-Warning "No images inside $($zip.Name); kept the archive." }
    } catch {
        Write-Warning "Could not unpack $($zip.Name): $($_.Exception.Message). The archive was kept."
        if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
    }
}

# --- 1b. Convert PDFs into folders of JPG pages (Windows' built-in PDF renderer, no install) ---
$pdfs = @(Get-ChildItem -LiteralPath $manga -Recurse -File -Filter *.pdf)
if ($pdfs.Count) {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
    $null = [Windows.Data.Pdf.PdfPageRenderOptions, Windows.Data.Pdf, ContentType = WindowsRuntime]
    $null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapEncoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
    $asTask  = [WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 }
    $taskOp  = $asTask | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
    $taskAct = $asTask | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
    function Await($op, [type]$t) { $task = $taskOp.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(); $task.Result }
    function AwaitAct($op) { $taskAct.Invoke($null, @($op)).Wait() }
}
foreach ($pdf in $pdfs) {
    $dest = Join-Path $pdf.DirectoryName $pdf.BaseName
    if (Test-Path -LiteralPath $dest) { Write-Warning "Skipped $($pdf.Name): a folder named '$($pdf.BaseName)' already exists next to it."; continue }
    $fs = $null
    try {
        $fs  = [IO.File]::OpenRead($pdf.FullName)
        $doc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromStreamAsync([IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fs))) ([Windows.Data.Pdf.PdfDocument])
        New-Item -ItemType Directory -Path $dest | Out-Null
        $opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions
        $opts.DestinationHeight = 1800   # px; raise for sharper pages, lower to save space
        $opts.BitmapEncoderId = [Windows.Graphics.Imaging.BitmapEncoder]::JpegEncoderId
        for ($i = 0; $i -lt $doc.PageCount; $i++) {
            Write-Progress -Activity "Converting $($pdf.Name)" -Status "Page $($i + 1) of $($doc.PageCount)" -PercentComplete (100 * $i / $doc.PageCount)
            $page = $doc.GetPage($i)
            $ms = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
            AwaitAct ($page.RenderToStreamAsync($ms, $opts))
            $out = [IO.File]::Create((Join-Path $dest ('{0:D4}.jpg' -f ($i + 1))))
            [IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($ms.GetInputStreamAt(0)).CopyTo($out)
            $out.Close(); $ms.Dispose(); $page.Dispose()
        }
        Write-Progress -Activity "Converting $($pdf.Name)" -Completed
        $fs.Close(); $fs = $null
        Write-Host "Converted $($pdf.Name): $($doc.PageCount) pages"
        Remove-Item -LiteralPath $pdf.FullName -Force
    } catch {
        Write-Warning "Could not convert $($pdf.Name): $($_.Exception.Message). The PDF was kept."
        if ($fs) { $fs.Close() }
        if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
    }
}

# --- 2. Scan series ---
$series = @(foreach ($sd in @(Get-ChildItem -LiteralPath $manga -Directory | Where-Object { $_.Name -notlike '.*' } | Sort-Object { NatKey $_.Name })) {
    $s = [ordered]@{
        id        = $sd.Name
        title     = $sd.Name
        direction = 'rtl'
        cover     = ''
        added     = ([DateTimeOffset]$sd.CreationTimeUtc).ToUnixTimeMilliseconds()
        chapters  = @()
    }
    $info = Join-Path $sd.FullName 'info.txt'
    if (Test-Path -LiteralPath $info) {
        foreach ($line in Get-Content -LiteralPath $info -Encoding UTF8) {
            if ($line -match '^\s*title\s*:\s*(.+?)\s*$') { $s.title = $Matches[1] }
            elseif ($line -match '^\s*direction\s*:\s*(ltr|rtl)\s*$') { $s.direction = $Matches[1].ToLower() }
        }
    }
    $cover = Get-ChildItem -LiteralPath $sd.FullName -File | Where-Object { $_.Name -match "^cover$img" } | Select-Object -First 1
    if ($cover) { $s.cover = $cover.Name }

    # Every folder (including the series folder itself) that directly holds images is a chapter.
    $dirs = @($sd) + @(Get-ChildItem -LiteralPath $sd.FullName -Directory -Recurse |
        Where-Object { $_.FullName.Substring($sd.FullName.Length) -notmatch '\\\.' })
    $chapters = @(foreach ($d in $dirs) {
        $isRoot = $d.FullName -eq $sd.FullName
        $pages = @(Get-ChildItem -LiteralPath $d.FullName -File |
            Where-Object { (IsImage $_) -and -not ($isRoot -and $_.Name -match "^cover$img") } |
            Sort-Object { NatKey $_.Name } | ForEach-Object { $_.Name })
        if ($pages.Count) {
            $rel = $d.FullName.Substring($sd.FullName.Length).TrimStart('\') -replace '\\', '/'
            [ordered]@{ id = $(if ($rel) { $rel } else { '.' }); pages = $pages }
        }
    })
    $s.chapters = @($chapters | Sort-Object { if ($_.id -eq '.') { '' } else { NatKey $_.id } })
    if ($s.chapters.Count) {
        Write-Host ("  {0}: {1} chapter(s)" -f $s.title, $s.chapters.Count)
        $s
    } else { Write-Warning "No images found in '$($sd.Name)'; left it out." }
})

# --- 3. Write data\library.js ---
$lib = [ordered]@{ generated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'); series = $series }
$json = ConvertTo-Json -InputObject $lib -Depth 6 -Compress
[IO.File]::WriteAllText((Join-Path $data 'library.js'), "window.LIBRARY = $json;`n", (New-Object Text.UTF8Encoding $false))
Write-Host ''
Write-Host "Done: $($series.Count) series written to data\library.js"
