# PowerShell script to set Java 17 as default for current session

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Java 17 Environment Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Java 17 is installed
$java17Paths = @(
    "C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot",
    "C:\Program Files\Eclipse Adoptium\jdk-17.0.12.7-hotspot",
    "C:\Program Files\Eclipse Adoptium\jdk-17.0.11.9-hotspot",
    "C:\Program Files\Java\jdk-17",
    "C:\Program Files\Java\jdk-17.0.13",
    "C:\Program Files\Java\jdk-17.0.12",
    "C:\Program Files\Java\jdk-17.0.11"
)

$java17Path = $null
foreach ($path in $java17Paths) {
    if (Test-Path $path) {
        $java17Path = $path
        break
    }
}

# Also check for any jdk-17* folders
if (-not $java17Path) {
    $adoptiumPath = "C:\Program Files\Eclipse Adoptium"
    if (Test-Path $adoptiumPath) {
        $java17Folders = Get-ChildItem $adoptiumPath -Directory | Where-Object { $_.Name -like "jdk-17*" }
        if ($java17Folders) {
            $java17Path = $java17Folders[0].FullName
        }
    }
}

if (-not $java17Path) {
    $javaPath = "C:\Program Files\Java"
    if (Test-Path $javaPath) {
        $java17Folders = Get-ChildItem $javaPath -Directory | Where-Object { $_.Name -like "jdk-17*" }
        if ($java17Folders) {
            $java17Path = $java17Folders[0].FullName
        }
    }
}

if (-not $java17Path) {
    Write-Host "ERROR: Java 17 not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Java 17 from:" -ForegroundColor Yellow
    Write-Host "https://adoptium.net/temurin/releases/?version=17" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or use the direct download link:" -ForegroundColor Yellow
    Write-Host "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_windows_hotspot_17.0.13_11.msi" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "After installation, run this script again." -ForegroundColor Yellow
    Write-Host ""
    pause
    exit 1
}

Write-Host "Found Java 17 at:" -ForegroundColor Green
Write-Host $java17Path -ForegroundColor White
Write-Host ""

# Set environment variables for current session
$env:JAVA_HOME = $java17Path
$env:PATH = "$java17Path\bin;$env:PATH"

Write-Host "Setting JAVA_HOME to:" -ForegroundColor Green
Write-Host $env:JAVA_HOME -ForegroundColor White
Write-Host ""

# Verify
Write-Host "Verifying Java version..." -ForegroundColor Cyan
Write-Host ""
java -version
Write-Host ""

# Check if it's Java 17
$javaVersionOutput = java -version 2>&1 | Select-String "version"
if ($javaVersionOutput -match '"17\.') {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "SUCCESS! Java 17 is now active!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now build your APK:" -ForegroundColor Yellow
    Write-Host "  .\build-apk.bat" -ForegroundColor White
    Write-Host ""
    Write-Host "Or manually:" -ForegroundColor Yellow
    Write-Host "  cd android" -ForegroundColor White
    Write-Host "  ./gradlew assembleRelease --no-daemon" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "WARNING: Java version check did not show Java 17" -ForegroundColor Yellow
    Write-Host "You may need to restart PowerShell or your computer" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "NOTE: This change is only for the current PowerShell session." -ForegroundColor Cyan
Write-Host "To make it permanent, set JAVA_HOME in System Environment Variables." -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
