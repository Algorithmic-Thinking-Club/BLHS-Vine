$root = $PSScriptRoot
$exts = '.jpg','.jpeg','.png','.gif','.webp','.bmp'
$folders = Get-ChildItem $root -Directory | Sort-Object Name
$sb = New-Object System.Text.StringBuilder
[void]$sb.Append(@"
<!doctype html><html><head><meta charset="utf-8"><title>BLHS reference library</title>
<style>
body{margin:0;background:#0f0f10;color:#eee;font-family:ui-sans-serif,system-ui,sans-serif;padding:32px}
h1{font-size:24px;margin:0 0 4px}.sub{color:#888;margin:0 0 28px;font-size:13px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#9fb2ad;border-bottom:1px solid #2a2a2c;padding-bottom:8px;margin:36px 0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.cell{background:#1a1a1c;border:1px solid #2a2a2c;border-radius:10px;overflow:hidden}
.cell img{width:100%;height:160px;object-fit:cover;display:block;background:#000}
.cell .cap{padding:8px 10px;font-size:11px;color:#9aa;font-family:ui-monospace,monospace;word-break:break-all}
.count{color:#666;font-weight:400}
</style></head><body>
<h1>BLHS visual reference library</h1>
<p class="sub">auto-generated &middot; re-run generate-gallery.ps1 to refresh as it grows &middot; LOCAL only (gitignored)</p>
"@)
foreach ($f in $folders) {
  $imgs = Get-ChildItem $f.FullName -File | Where-Object { $exts -contains $_.Extension.ToLower() } | Sort-Object Name
  if ($imgs.Count -eq 0) { continue }
  [void]$sb.Append("<h2>$($f.Name) <span class='count'>($($imgs.Count))</span></h2><div class='grid'>")
  foreach ($im in $imgs) {
    $rel = "$($f.Name)/$($im.Name)"
    [void]$sb.Append("<div class='cell'><a href='$rel' target='_blank'><img src='$rel' loading='lazy'></a><div class='cap'>$($im.Name)</div></div>")
  }
  [void]$sb.Append("</div>")
}
[void]$sb.Append("</body></html>")
Set-Content -Path (Join-Path $root 'gallery.html') -Value $sb.ToString() -Encoding UTF8
Write-Output "gallery.html written"
