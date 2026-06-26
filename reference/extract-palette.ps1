Add-Type -AssemblyName System.Drawing
$root = $PSScriptRoot
$files = Get-ChildItem (Join-Path $root 'campus-exterior') -File -Include *.jpg,*.jpeg,*.png -Recurse
$buckets = @{}
foreach ($file in $files) {
  try { $bmp = [System.Drawing.Bitmap]::FromFile($file.FullName) } catch { continue }
  $stepX = [Math]::Max(1, [int]($bmp.Width / 90))
  $stepY = [Math]::Max(1, [int]($bmp.Height / 90))
  for ($x = 0; $x -lt $bmp.Width; $x += $stepX) {
    for ($y = 0; $y -lt $bmp.Height; $y += $stepY) {
      $c = $bmp.GetPixel($x, $y)
      $r = [int]($c.R / 24) * 24
      $g = [int]($c.G / 24) * 24
      $b = [int]($c.B / 24) * 24
      $key = "$r,$g,$b"
      if ($buckets.ContainsKey($key)) { $buckets[$key]++ } else { $buckets[$key] = 1 }
    }
  }
  $bmp.Dispose()
}
$top = $buckets.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 30
$sb = New-Object System.Text.StringBuilder
[void]$sb.Append('<!doctype html><html><head><meta charset="utf-8"><title>BLHS extracted palette</title><style>body{margin:0;background:#111;color:#eee;font-family:ui-monospace,monospace;padding:32px}h1{font-family:ui-sans-serif,system-ui}.row{display:flex;flex-wrap:wrap;gap:10px}.s{width:130px;border:1px solid #333;border-radius:8px;overflow:hidden}.s .c{height:80px}.s .m{padding:6px 8px;font-size:11px;color:#aaa}</style></head><body><h1>BLHS true campus palette</h1><p style="color:#888">sampled from real exterior photos in campus-exterior/ &mdash; dominant colors, most frequent first</p><div class="row">')
foreach ($e in $top) {
  $p = $e.Key -split ','
  $hex = '#{0:x2}{1:x2}{2:x2}' -f [int]$p[0], [int]$p[1], [int]$p[2]
  [void]$sb.Append("<div class='s'><div class='c' style='background:$hex'></div><div class='m'>$hex<br>n=$($e.Value)</div></div>")
}
[void]$sb.Append('</div></body></html>')
Set-Content -Path (Join-Path $root 'palette.html') -Value $sb.ToString() -Encoding UTF8
Write-Output "palette.html written from $($files.Count) photos"
