@echo off
echo ========================================
echo 1RadMobile APK Builder
echo ========================================
echo.

REM Check Java version
echo Checking Java version...
java -version 2>&1 | findstr /i "version" > nul
if errorlevel 1 (
    echo ERROR: Java is not installed or not in PATH
    echo Please install Java 17 from: https://adoptium.net/temurin/releases/?version=17
    pause
    exit /b 1
)

echo.
echo Java version check:
java -version
echo.

REM Check if we're in the right directory
if not exist "android" (
    echo ERROR: android folder not found
    echo Please run this script from the 1RadMobile directory
    pause
    exit /b 1
)

echo ========================================
echo Choose build type:
echo 1. Debug APK (faster, for testing)
echo 2. Release APK (optimized, for distribution)
echo ========================================
set /p choice="Enter your choice (1 or 2): "

if "%choice%"=="1" (
    echo.
    echo Building DEBUG APK...
    echo.
    cd android
    call gradlew assembleDebug --no-daemon
    if errorlevel 1 (
        echo.
        echo BUILD FAILED!
        echo Check the error messages above.
        cd ..
        pause
        exit /b 1
    )
    echo.
    echo ========================================
    echo SUCCESS! Debug APK created at:
    echo android\app\build\outputs\apk\debug\app-debug.apk
    echo ========================================
    echo.
    echo Opening APK location...
    start "" "app\build\outputs\apk\debug"
    cd ..
) else if "%choice%"=="2" (
    echo.
    echo Building RELEASE APK...
    echo This may take 5-10 minutes...
    echo.
    cd android
    call gradlew assembleRelease --no-daemon
    if errorlevel 1 (
        echo.
        echo BUILD FAILED!
        echo Check the error messages above.
        cd ..
        pause
        exit /b 1
    )
    echo.
    echo ========================================
    echo SUCCESS! Release APK created at:
    echo android\app\build\outputs\apk\release\app-release.apk
    echo ========================================
    echo.
    echo Opening APK location...
    start "" "app\build\outputs\apk\release"
    cd ..
) else (
    echo Invalid choice. Please run the script again.
    pause
    exit /b 1
)

echo.
echo You can now:
echo 1. Transfer the APK to your Android device
echo 2. Install it by opening the APK file on your device
echo 3. Or use: adb install [apk-file-name]
echo.
pause
