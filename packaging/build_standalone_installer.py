from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

APP_NAME = "原生瞬联"
INSTALLER_NAME = "原生瞬联安装器"
LAUNCHER_EXE_NAME = f"{APP_NAME}.exe"
INSTALLER_EXE_NAME = f"{INSTALLER_NAME}.exe"

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = REPO_ROOT / "frontend"
BACKEND_DIR = REPO_ROOT / "backend"
BUILD_ROOT = REPO_ROOT / "release"
STAGE_ROOT = BUILD_ROOT / "standalone-stage"
PAYLOAD_ROOT = STAGE_ROOT / "payload"
APP_ROOT = PAYLOAD_ROOT / "app"
INSTALLER_PATH = BUILD_ROOT / INSTALLER_EXE_NAME
INSTALLER_ALIAS_PATH = BUILD_ROOT / f"{APP_NAME}.exe"
LAUNCHER_BUILD_DIR = BUILD_ROOT / "standalone-launcher-publish"
PYTHON_HOME = Path(sys.executable).resolve().parent
RUNTIME_ENV = BUILD_ROOT / "standalone-buildenv"
SEVEN_ZIP_EXE = Path(r"C:\Program Files\NVIDIA Corporation\NVIDIA app\7z.exe")
SEVEN_ZIP_DLL = SEVEN_ZIP_EXE.with_name("7z.dll")


def run(command: list[str], cwd: Path | None = None) -> None:
    print(">", " ".join(command))
    if os.name == "nt":
        subprocess.run(
            subprocess.list2cmdline(command),
            cwd=cwd or REPO_ROOT,
            check=True,
            shell=True,
        )
        return
    subprocess.run(command, cwd=cwd or REPO_ROOT, check=True)


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def copy_tree(src: Path, dst: Path, ignore=None) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=ignore)


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def build_frontend() -> None:
    dist_index = FRONTEND_DIR / "dist" / "index.html"
    if dist_index.exists():
        print(f"Using existing frontend build: {dist_index}")
        return
    run(["npm", "run", "build"], cwd=FRONTEND_DIR)


def build_launcher() -> Path:
    if LAUNCHER_BUILD_DIR.exists():
        shutil.rmtree(LAUNCHER_BUILD_DIR)
    project = REPO_ROOT / "packaging" / "StandaloneLauncher" / "StandaloneLauncher.csproj"
    run(
        [
            "dotnet",
            "publish",
            str(project),
            "-c",
            "Release",
            "-r",
            "win-x64",
            "--self-contained",
            "true",
            "-o",
            str(LAUNCHER_BUILD_DIR),
        ]
    )
    launcher = LAUNCHER_BUILD_DIR / LAUNCHER_EXE_NAME
    if not launcher.exists():
        raise FileNotFoundError(f"Standalone launcher executable was not generated: {launcher}")
    return launcher


def env_python(env_root: Path) -> Path:
    return env_root / "Scripts" / "python.exe"


def ensure_runtime_env() -> None:
    python_exe = env_python(RUNTIME_ENV)
    if not python_exe.exists():
        run([sys.executable, "-m", "venv", str(RUNTIME_ENV)])
    run([str(python_exe), "-m", "pip", "install", "--upgrade", "pip"])
    run([str(python_exe), "-m", "pip", "install", "-r", str(BACKEND_DIR / "requirements.txt")])


def build_portable_python(runtime_root: Path) -> None:
    python_root = runtime_root / "python"
    lib_root = python_root / "Lib"
    stdlib_root = PYTHON_HOME / "Lib"
    build_site_packages = RUNTIME_ENV / "Lib" / "site-packages"

    reset_dir(runtime_root)
    python_root.mkdir(parents=True, exist_ok=True)

    core_files = [
        "python.exe",
        "pythonw.exe",
        "python311.dll",
        "python3.dll",
        "vcruntime140.dll",
        "vcruntime140_1.dll",
    ]
    for name in core_files:
        src = PYTHON_HOME / name
        if src.exists():
            copy_file(src, python_root / name)

    if (PYTHON_HOME / "DLLs").exists():
        copy_tree(PYTHON_HOME / "DLLs", python_root / "DLLs")

    copy_tree(
        stdlib_root,
        lib_root,
        ignore=shutil.ignore_patterns(
            "site-packages",
            "__pycache__",
            "*.pyc",
            "*.pyo",
            "test",
            "tests",
            "tkinter",
            "turtledemo",
            "idlelib",
        ),
    )

    site_target = lib_root / "site-packages"
    copy_tree(
        build_site_packages,
        site_target,
        ignore=shutil.ignore_patterns(
            "__pycache__",
            "*.pyc",
            "*.pyo",
            "pip",
            "pip-*",
            "setuptools",
            "setuptools-*",
            "wheel",
            "wheel-*",
            "test",
            "tests",
        ),
    )


def stage_application() -> None:
    reset_dir(STAGE_ROOT)
    reset_dir(PAYLOAD_ROOT)
    reset_dir(APP_ROOT)

    build_portable_python(APP_ROOT)
    launcher_exe = build_launcher()

    backend_target = APP_ROOT / "backend"
    frontend_target = APP_ROOT / "frontend"
    tools_target = APP_ROOT / "tools"

    backend_target.mkdir(parents=True, exist_ok=True)
    frontend_target.mkdir(parents=True, exist_ok=True)
    tools_target.mkdir(parents=True, exist_ok=True)

    copy_tree(BACKEND_DIR / "app", backend_target / "app")
    copy_tree(BACKEND_DIR / "alembic", backend_target / "alembic")
    copy_file(BACKEND_DIR / "alembic.ini", backend_target / "alembic.ini")

    assets_target = backend_target / "assets"
    (assets_target / "models").mkdir(parents=True, exist_ok=True)
    (assets_target / "recordings").mkdir(parents=True, exist_ok=True)
    (assets_target / "chat_audio").mkdir(parents=True, exist_ok=True)
    copy_tree(BACKEND_DIR / "assets" / "animations", assets_target / "animations")
    copy_tree(BACKEND_DIR / "assets" / "presets", assets_target / "presets")
    placeholder = BACKEND_DIR / "assets" / "models" / "model-placeholder.jpg"
    if placeholder.exists():
        copy_file(placeholder, assets_target / "models" / "model-placeholder.jpg")
    copy_file(BACKEND_DIR / "run_server.py", backend_target / "run_server.py")

    env_source = BACKEND_DIR / ".env"
    if env_source.exists():
        copy_file(env_source, backend_target / ".env")
    copy_file(BACKEND_DIR / ".env.example", backend_target / ".env.example")
    copy_file(BACKEND_DIR / "requirements.txt", backend_target / "requirements.txt")

    db_source = BACKEND_DIR / "interactive_avatar.db"
    if db_source.exists():
        copy_file(db_source, backend_target / "interactive_avatar.db")

    copy_tree(FRONTEND_DIR / "dist", frontend_target / "dist")
    public_target = frontend_target / "public"
    (public_target / "textures").mkdir(parents=True, exist_ok=True)
    copy_tree(FRONTEND_DIR / "public" / "textures", public_target / "textures")

    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        copy_file(Path(ffmpeg_path), tools_target / "ffmpeg.exe")
    copy_file(launcher_exe, APP_ROOT / LAUNCHER_EXE_NAME)

    write_file(
        APP_ROOT / f"启动{APP_NAME}.bat",
        rf"""@echo off
setlocal
set "ROOT=%~dp0"
set "PYTHON=%ROOT%python\python.exe"
set "PATH=%ROOT%tools;%ROOT%python;%ROOT%python\DLLs;%PATH%"
set "PYTHONHOME=%ROOT%python"
set "PYTHONPATH=%ROOT%backend;%ROOT%python\Lib;%ROOT%python\Lib\site-packages"
set "NO_BROWSER=0"
if /I "%~1"=="--no-browser" set "NO_BROWSER=1"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok = $false; try {{ $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8788/health -TimeoutSec 2; if ($r.StatusCode -eq 200) {{ $ok = $true }} }} catch {{}}; if (-not $ok) {{ Start-Process -WindowStyle Hidden -FilePath '%PYTHON%' -ArgumentList 'run_server.py' -WorkingDirectory '%ROOT%backend' }}; for ($i=0; $i -lt 60; $i++) {{ try {{ $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8788/health -TimeoutSec 2; if ($r.StatusCode -eq 200) {{ if ('%NO_BROWSER%' -eq '0') {{ Start-Process 'http://127.0.0.1:8788' }}; exit 0 }} }} catch {{}}; Start-Sleep -Milliseconds 500 }}; if ('%NO_BROWSER%' -eq '0') {{ Start-Process 'http://127.0.0.1:8788' }}"
""",
    )

    write_file(
        APP_ROOT / f"卸载{APP_NAME}.bat",
        rf"""@echo off
setlocal
set "DESKTOP=%USERPROFILE%\Desktop\{APP_NAME}.lnk"
set "STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\{APP_NAME}.lnk"
if exist "%DESKTOP%" del /f /q "%DESKTOP%"
if exist "%STARTMENU%" del /f /q "%STARTMENU%"
cd /d "%~dp0.."
rmdir /s /q "%~dp0"
""",
    )

    write_file(
        APP_ROOT / "README.txt",
        f"{APP_NAME}\r\n\r\n"
        f"1. 双击“{LAUNCHER_EXE_NAME}”。\r\n"
        "2. 等待本地服务启动到 http://127.0.0.1:8788。\r\n"
        "3. 服务就绪后会自动打开浏览器。\r\n",
    )


def write_installer_support() -> tuple[Path, Path, Path, Path, Path]:
    install_ps1 = STAGE_ROOT / "create-shortcuts.ps1"
    install_bat = STAGE_ROOT / "install.bat"
    if not SEVEN_ZIP_EXE.exists() or not SEVEN_ZIP_DLL.exists():
        raise FileNotFoundError("7-Zip executable or DLL was not found for standalone packaging.")
    payload_archive = STAGE_ROOT / "app_payload.7z"
    if payload_archive.exists():
        payload_archive.unlink()
    run(
        [
            str(SEVEN_ZIP_EXE),
            "a",
            "-t7z",
            "-mx=9",
            str(payload_archive),
            str(APP_ROOT / "*"),
        ],
        cwd=APP_ROOT,
    )
    seven_zip_exe_target = STAGE_ROOT / "7z.exe"
    seven_zip_dll_target = STAGE_ROOT / "7z.dll"
    copy_file(SEVEN_ZIP_EXE, seven_zip_exe_target)
    copy_file(SEVEN_ZIP_DLL, seven_zip_dll_target)

    write_file(
        install_ps1,
        rf"""param([string]$InstallDir)
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$entries = @(
  @{{Path=(Join-Path $desktop "{APP_NAME}.lnk"); Target=(Join-Path $InstallDir "{LAUNCHER_EXE_NAME}")}},
  @{{Path=(Join-Path $startMenu "{APP_NAME}.lnk"); Target=(Join-Path $InstallDir "{LAUNCHER_EXE_NAME}")}}
)
foreach ($entry in $entries) {{
  $shortcut = $shell.CreateShortcut($entry.Path)
  $shortcut.TargetPath = $entry.Target
  $shortcut.WorkingDirectory = $InstallDir
  $shortcut.IconLocation = (Join-Path $InstallDir "{LAUNCHER_EXE_NAME}")
  $shortcut.Save()
}}
""",
    )

    write_file(
        install_bat,
        rf"""@echo off
setlocal
set "TARGET=%LocalAppData%\Programs\{APP_NAME}"
echo Installing {APP_NAME} to "%TARGET%"...
if exist "%TARGET%" rmdir /s /q "%TARGET%"
mkdir "%TARGET%"
"%~dp07z.exe" x -y "app_payload.7z" -o"%TARGET%" >nul
if errorlevel 1 exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "create-shortcuts.ps1" -InstallDir "%TARGET%"
start "" "%TARGET%\启动{APP_NAME}.bat"
echo Installation finished.
exit /b 0
""",
    )

    return install_bat, install_ps1, payload_archive, seven_zip_exe_target, seven_zip_dll_target


def build_installer() -> None:
    write_installer_support()
    publish_dir = BUILD_ROOT / "standalone-installer-publish"
    if publish_dir.exists():
        shutil.rmtree(publish_dir)
    project = REPO_ROOT / "packaging" / "StandaloneInstaller" / "StandaloneInstaller.csproj"
    if INSTALLER_PATH.exists():
        INSTALLER_PATH.unlink()
    if INSTALLER_ALIAS_PATH.exists():
        INSTALLER_ALIAS_PATH.unlink()
    run(
        [
            "dotnet",
            "publish",
            str(project),
            "-c",
            "Release",
            "-r",
            "win-x64",
            "--self-contained",
            "true",
            "-o",
            str(publish_dir),
        ]
    )
    built_exe = publish_dir / INSTALLER_EXE_NAME
    if not built_exe.exists():
        raise FileNotFoundError(f"Standalone installer executable was not generated: {built_exe}")
    copy_file(built_exe, INSTALLER_PATH)
    copy_file(built_exe, INSTALLER_ALIAS_PATH)


def main() -> None:
    BUILD_ROOT.mkdir(parents=True, exist_ok=True)
    build_frontend()
    ensure_runtime_env()
    stage_application()
    build_installer()
    print(f"\nStandalone installer created: {INSTALLER_PATH}")


if __name__ == "__main__":
    main()
