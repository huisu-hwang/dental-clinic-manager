# Node.js LTS Auto-Install Script
# Tries multiple methods: winget -> direct MSI download -> chocolatey
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host "  Node.js LTS Auto-Install" -ForegroundColor Cyan
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if already installed (refresh PATH first)
$nodePaths = @(
    "$env:ProgramFiles\nodejs",
    "${env:ProgramFiles(x86)}\nodejs",
    "$env:LOCALAPPDATA\Programs\nodejs",
    "$env:APPDATA\nvm\current"
)
foreach ($np in $nodePaths) {
    if (Test-Path "$np\node.exe") {
        $env:PATH = "$np;$env:PATH"
        Write-Host "  [OK] Node.js already installed at: $np" -ForegroundColor Green
        & "$np\node.exe" -v
        exit 0
    }
}

# Refresh PATH from registry (in case it was installed but PATH not updated in this session)
$machinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
$env:PATH = "$machinePath;$userPath"

$nodeCheck = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCheck) {
    Write-Host "  [OK] Node.js found in PATH: $($nodeCheck.Source)" -ForegroundColor Green
    node -v
    exit 0
}

$installed = $false

# ============================================
# Method 1: winget (Windows 10 1709+ / Windows 11)
# ============================================
Write-Host "  [1/3] Trying winget..." -ForegroundColor Yellow

$wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
if ($wingetCmd) {
    try {
        Write-Host "  [*] Installing Node.js LTS via winget..."
        $wingetResult = & winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent 2>&1
        $wingetExitCode = $LASTEXITCODE

        # winget exit code 0 = success, -1978335189 = already installed
        if ($wingetExitCode -eq 0 -or $wingetExitCode -eq -1978335189 -or ($wingetResult -match "successfully installed|already installed")) {
            Write-Host "  [OK] winget install completed" -ForegroundColor Green
            $installed = $true
        } else {
            Write-Host "  [!] winget install returned exit code: $wingetExitCode" -ForegroundColor Yellow
            Write-Host "       $($wingetResult | Out-String)" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  [!] winget failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [!] winget not available on this system" -ForegroundColor Yellow
}

# ============================================
# Method 2: Direct MSI download and install
# ============================================
if (-not $installed) {
    Write-Host ""
    Write-Host "  [2/3] Trying direct MSI download..." -ForegroundColor Yellow

    # Try to get the latest LTS version dynamically
    $nodeVersion = $null
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
        $response = Invoke-WebRequest -Uri "https://nodejs.org/dist/latest-v22.x/" -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        if ($response.Content -match 'node-(v[\d\.]+)-x64\.msi') {
            $nodeVersion = $Matches[1]
        }
    } catch {
        Write-Host "  [!] Could not detect latest version, using fallback" -ForegroundColor Yellow
    }

    # Fallback versions to try (newest first)
    $versions = @()
    if ($nodeVersion) {
        $versions += $nodeVersion
    }
    $versions += @("v22.14.0", "v20.18.3", "v20.11.1")

    $installerPath = "$env:TEMP\node-installer.msi"
    $downloadSuccess = $false

    foreach ($ver in $versions) {
        $url = "https://nodejs.org/dist/$ver/node-$ver-x64.msi"
        Write-Host "  [*] Trying Node.js $ver..."
        Write-Host "       URL: $url"

        # Try multiple download methods
        # Method 2a: System.Net.WebClient (faster, more reliable)
        if (-not $downloadSuccess) {
            try {
                $webClient = New-Object System.Net.WebClient
                $webClient.Headers.Add("User-Agent", "DentWeb-Bridge-Agent-Setup")
                $webClient.DownloadFile($url, $installerPath)
                if ((Test-Path $installerPath) -and (Get-Item $installerPath).Length -gt 1MB) {
                    $downloadSuccess = $true
                    Write-Host "  [OK] Download complete (WebClient)" -ForegroundColor Green
                }
            } catch {
                Write-Host "  [!] WebClient download failed: $($_.Exception.Message)" -ForegroundColor Yellow
            } finally {
                if ($webClient) { $webClient.Dispose() }
            }
        }

        # Method 2b: Invoke-WebRequest
        if (-not $downloadSuccess) {
            try {
                Invoke-WebRequest -Uri $url -OutFile $installerPath -UseBasicParsing -TimeoutSec 120
                if ((Test-Path $installerPath) -and (Get-Item $installerPath).Length -gt 1MB) {
                    $downloadSuccess = $true
                    Write-Host "  [OK] Download complete (Invoke-WebRequest)" -ForegroundColor Green
                }
            } catch {
                Write-Host "  [!] Invoke-WebRequest failed: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }

        # Method 2c: curl.exe (available on Windows 10+)
        if (-not $downloadSuccess) {
            $curlCmd = Get-Command curl.exe -ErrorAction SilentlyContinue
            if ($curlCmd) {
                try {
                    & curl.exe -L -o $installerPath $url --silent --show-error --retry 2 --connect-timeout 30
                    if ((Test-Path $installerPath) -and (Get-Item $installerPath).Length -gt 1MB) {
                        $downloadSuccess = $true
                        Write-Host "  [OK] Download complete (curl)" -ForegroundColor Green
                    }
                } catch {
                    Write-Host "  [!] curl failed: $($_.Exception.Message)" -ForegroundColor Yellow
                }
            }
        }

        # Method 2d: BitsTransfer (background download service)
        if (-not $downloadSuccess) {
            try {
                Import-Module BitsTransfer -ErrorAction Stop
                Start-BitsTransfer -Source $url -Destination $installerPath -ErrorAction Stop
                if ((Test-Path $installerPath) -and (Get-Item $installerPath).Length -gt 1MB) {
                    $downloadSuccess = $true
                    Write-Host "  [OK] Download complete (BitsTransfer)" -ForegroundColor Green
                }
            } catch {
                Write-Host "  [!] BitsTransfer failed: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }

        if ($downloadSuccess) { break }
    }

    if ($downloadSuccess) {
        Write-Host "  [*] Installing Node.js (silent mode)..."
        $msiProcess = Start-Process msiexec.exe -ArgumentList "/i", "`"$installerPath`"", "/qn", "/norestart", "ADDLOCAL=ALL" -Wait -NoNewWindow -PassThru
        if ($msiProcess.ExitCode -eq 0) {
            Write-Host "  [OK] MSI installation completed" -ForegroundColor Green
            $installed = $true
        } else {
            Write-Host "  [!] MSI install exit code: $($msiProcess.ExitCode)" -ForegroundColor Yellow
            # Try with UI for debugging
            Write-Host "  [*] Retrying with basic UI..."
            $msiProcess2 = Start-Process msiexec.exe -ArgumentList "/i", "`"$installerPath`"", "/qb", "/norestart", "ADDLOCAL=ALL" -Wait -NoNewWindow -PassThru
            if ($msiProcess2.ExitCode -eq 0) {
                $installed = $true
                Write-Host "  [OK] MSI installation completed (with UI)" -ForegroundColor Green
            }
        }
        # Cleanup installer
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "  [!] All download attempts failed" -ForegroundColor Yellow
    }
}

# ============================================
# Method 3: Chocolatey (if available)
# ============================================
if (-not $installed) {
    Write-Host ""
    Write-Host "  [3/3] Trying Chocolatey..." -ForegroundColor Yellow

    $chocoCmd = Get-Command choco -ErrorAction SilentlyContinue
    if ($chocoCmd) {
        try {
            & choco install nodejs-lts -y --no-progress 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $installed = $true
                Write-Host "  [OK] Chocolatey install completed" -ForegroundColor Green
            }
        } catch {
            Write-Host "  [!] Chocolatey failed: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [!] Chocolatey not available" -ForegroundColor Yellow
    }
}

# ============================================
# Verify installation
# ============================================
Write-Host ""

if ($installed) {
    # Refresh PATH
    $machinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH = "$machinePath;$userPath"

    # Also check common paths
    foreach ($np in $nodePaths) {
        if ((Test-Path "$np\node.exe") -and ($env:PATH -notlike "*$np*")) {
            $env:PATH = "$np;$env:PATH"
        }
    }

    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmd) {
        $nodeVer = & node -v 2>&1
        Write-Host "  ==========================================" -ForegroundColor Green
        Write-Host "  [OK] Node.js installed successfully!" -ForegroundColor Green
        Write-Host "       Version: $nodeVer" -ForegroundColor Green
        Write-Host "       Path: $($nodeCmd.Source)" -ForegroundColor Green
        Write-Host "  ==========================================" -ForegroundColor Green
        exit 0
    } else {
        # Node installed but not in current PATH - set it manually
        $nodePath = "$env:ProgramFiles\nodejs"
        if (Test-Path "$nodePath\node.exe") {
            [Environment]::SetEnvironmentVariable("PATH", "$env:PATH;$nodePath", "Machine")
            $env:PATH = "$nodePath;$env:PATH"
            $nodeVer = & "$nodePath\node.exe" -v 2>&1
            Write-Host "  ==========================================" -ForegroundColor Green
            Write-Host "  [OK] Node.js installed successfully!" -ForegroundColor Green
            Write-Host "       Version: $nodeVer" -ForegroundColor Green
            Write-Host "       Path: $nodePath" -ForegroundColor Green
            Write-Host "  ==========================================" -ForegroundColor Green
            Write-Host ""
            Write-Host "  NOTE: You may need to restart this terminal" -ForegroundColor Yellow
            Write-Host "        for PATH changes to take effect." -ForegroundColor Yellow
            exit 0
        }
    }
}

# All methods failed
Write-Host "  ==========================================" -ForegroundColor Red
Write-Host "  [FAILED] Node.js installation failed" -ForegroundColor Red
Write-Host "  ==========================================" -ForegroundColor Red
Write-Host ""
Write-Host "  Please install Node.js manually:" -ForegroundColor Yellow
Write-Host "    1. Go to https://nodejs.org" -ForegroundColor White
Write-Host "    2. Download LTS version" -ForegroundColor White
Write-Host "    3. Run the installer" -ForegroundColor White
Write-Host "    4. Run setup.bat again" -ForegroundColor White
Write-Host ""
exit 1
