# Headless screenshot of the running dev game. Usage: powershell scripts/shot.ps1 [url] [out] [waitSec]
param(
  [string]$Url = "http://localhost:5189/?dev=1",
  [string]$Out = "C:\Users\ashcy\AdventureGame\reference\shot.png",
  [int]$Wait = 24
)
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (Test-Path $Out) { Remove-Item $Out -Force }
$a = @(
  "--headless=new","--no-sandbox","--hide-scrollbars",
  "--window-size=1366,768","--virtual-time-budget=$([int](($Wait+4)*1000))",
  "--screenshot=$Out",$Url
)
$p = Start-Process -FilePath $edge -ArgumentList $a -NoNewWindow -PassThru
Start-Sleep -Seconds $Wait
if (-not $p.HasExited) { $p.Kill() }
if (Test-Path $Out) { "OK $((Get-Item $Out).Length) bytes" } else { "NO SHOT" }
