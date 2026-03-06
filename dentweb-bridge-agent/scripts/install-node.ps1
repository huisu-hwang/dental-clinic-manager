# Node.js LTS 자동 설치 스크립트
$ErrorActionPreference = "Stop"

Write-Host "[*] Node.js LTS 설치를 시작합니다..." -ForegroundColor Cyan

$installerUrl = "https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi"
$installerPath = "$env:TEMP\node-installer.msi"

try {
    Write-Host "[*] Node.js 다운로드 중..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing

    Write-Host "[*] Node.js 설치 중 (자동 모드)..."
    Start-Process msiexec.exe -ArgumentList "/i", $installerPath, "/qn", "/norestart" -Wait -NoNewWindow

    # PATH에 추가
    $nodePath = "$env:ProgramFiles\nodejs"
    if ($env:PATH -notlike "*$nodePath*") {
        [Environment]::SetEnvironmentVariable("PATH", "$env:PATH;$nodePath", "Machine")
        $env:PATH = "$env:PATH;$nodePath"
    }

    Write-Host "[OK] Node.js 설치 완료!" -ForegroundColor Green

    # 설치 파일 정리
    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
} catch {
    Write-Host "[X] Node.js 설치 실패: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
