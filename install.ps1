$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# OutTalk supports Windows 10 and 11. Force TLS 1.2 for Windows PowerShell 5.1,
# which can otherwise inherit an older protocol default from .NET Framework.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$origin = 'https://outtalk.ru'
$work = Join-Path ([IO.Path]::GetTempPath()) ('outtalk-install-' + [Guid]::NewGuid().ToString('N'))
$feedPath = Join-Path $work 'latest.json'
$signaturePath = Join-Path $work 'installer.sig'
$installerPath = $null

function Get-OutTalkFile([string]$Uri, [string]$Path) {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $Path -PassThru
  $final = if ($response.BaseResponse.PSObject.Properties.Name -contains 'ResponseUri') {
    [Uri]$response.BaseResponse.ResponseUri
  } else {
    [Uri]$response.BaseResponse.RequestMessage.RequestUri
  }
  if ($final.Scheme -ne 'https' -or $final.Host -ne 'outtalk.ru' -or $final.AbsoluteUri -ne $Uri) {
    throw 'Сервер перенаправил загрузку на неожиданный адрес.'
  }
}

try {
  New-Item -ItemType Directory -Path $work | Out-Null
  Get-OutTalkFile "$origin/latest.json" $feedPath
  $feed = Get-Content -Raw -LiteralPath $feedPath | ConvertFrom-Json
  $version = [string]$feed.version
  if ($version -notmatch '^\d+\.\d+\.\d+(?:-beta\.\d+)?$') {
    throw 'Сайт вернул некорректный номер версии.'
  }

  $file = "OutTalk-Setup-$version.exe"
  $uri = "$origin/releases/$file"
  if ([string]$feed.downloads.win.url -ne $uri) {
    throw 'Сайт вернул неожиданный адрес установщика Windows.'
  }

  $installerPath = Join-Path $work $file
  Write-Host "Скачиваю OutTalk $version..."
  Get-OutTalkFile "$uri.sig" $signaturePath
  Get-OutTalkFile $uri $installerPath

  $signature = Get-Content -Raw -LiteralPath $signaturePath | ConvertFrom-Json
  if ($signature.format -ne 'outtalk-update-signature' -or $signature.v -ne 1 -or
      $signature.file -ne $file -or $signature.version -ne $version -or
      $signature.kid -ne 'u1' -or [string]::IsNullOrWhiteSpace([string]$signature.sha512)) {
    throw 'Опубликованные сведения о контрольной сумме некорректны.'
  }

  $stream = [IO.File]::OpenRead($installerPath)
  try {
    $sha = [Security.Cryptography.SHA512]::Create()
    try { $actual = [Convert]::ToBase64String($sha.ComputeHash($stream)) }
    finally { $sha.Dispose() }
  } finally {
    $stream.Dispose()
  }
  if ($actual -cne [string]$signature.sha512) {
    throw 'Контрольная сумма установщика не совпала. Файл удалён.'
  }

  if ([long]$feed.downloads.win.size -gt 0 -and (Get-Item -LiteralPath $installerPath).Length -ne [long]$feed.downloads.win.size) {
    throw 'Размер установщика не совпал с опубликованным.'
  }

  # Preserve the Internet-zone mark so Windows can apply its normal SmartScreen policy.
  try {
    Set-Content -LiteralPath $installerPath -Stream Zone.Identifier -Value "[ZoneTransfer]`r`nZoneId=3`r`nHostUrl=$uri`r`n" -ErrorAction Stop
  } catch {
    Write-Warning 'Не удалось добавить системную отметку файла из интернета.'
  }

  Write-Host 'Запускаю штатный установщик Windows...'
  $process = Start-Process -FilePath $installerPath -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Установщик завершился с кодом $($process.ExitCode)."
  }
  Write-Host 'OutTalk установлен.' -ForegroundColor Green
} finally {
  if (Test-Path -LiteralPath $work) {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  }
}
