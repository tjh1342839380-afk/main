$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

& 'C:\Program Files\nodejs\npm.cmd' run dev -- --host 0.0.0.0
