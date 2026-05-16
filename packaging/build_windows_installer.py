from __future__ import annotations

import os
import shutil
import subprocess
import sys
from importlib import metadata
from pathlib import Path

from packaging.requirements import Requirement


REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = REPO_ROOT / "frontend"
BACKEND_DIR = REPO_ROOT / "backend"
BUILD_ROOT = REPO_ROOT / "release"
STAGE_ROOT = BUILD_ROOT / "stage"
PAYLOAD_ROOT = STAGE_ROOT / "payload"
APP_ROOT = PAYLOAD_ROOT / "app"
INSTALLER_PATH = BUILD_ROOT / "InteractiveAvatarSetup.exe"
PYTHON_HOME = Path(sys.executable).resolve().parent
SITE_PACKAGES = PYTHON_HOME / "Lib" / "site-packages"


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


def iter_required_distributions() -> set[str]:
    queue: list[str] = []
    for line in (BACKEND_DIR / "requirements.txt").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        queue.append(Requirement(line).name.lower())

    installed = {
        dist.metadata["Name"].lower(): dist
        for dist in metadata.distributions()
        if dist.metadata.get("Name")
    }

    seen: set[str] = set()
    while queue:
        name = queue.pop(0)
        if name in seen or name not in installed:
            continue
        seen.add(name)
        dist = installed[name]
        for raw in dist.requires or []:
            try:
                req = Requirement(raw)
            except Exception:
                continue
            if req.marker and not req.marker.evaluate():
                continue
            dep = req.name.lower()
            if dep not in seen:
                queue.append(dep)
    return seen


def build_portable_python(runtime_root: Path) -> None:
    python_root = runtime_root / "python"
    lib_root = python_root / "Lib"
    stdlib_root = PYTHON_HOME / "Lib"

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
    site_target.mkdir(parents=True, exist_ok=True)

    installed = {
        dist.metadata["Name"].lower(): dist
        for dist in metadata.distributions()
        if dist.metadata.get("Name")
    }
    for dist_name in sorted(iter_required_distributions()):
        dist = installed.get(dist_name)
        if dist is None:
            continue
        for file in dist.files or []:
            source_path = Path(dist.locate_file(file))
            if not source_path.exists() or source_path.is_dir():
                continue
            try:
                relative = source_path.relative_to(SITE_PACKAGES)
            except ValueError:
                continue
            if not relative.parts or relative.parts[0] == "..":
                continue
            copy_file(source_path, site_target / relative)


def stage_application() -> None:
    reset_dir(STAGE_ROOT)
    reset_dir(PAYLOAD_ROOT)
    reset_dir(APP_ROOT)

    build_portable_python(APP_ROOT)

    backend_target = APP_ROOT / "backend"
    frontend_target = APP_ROOT / "frontend"
    tools_target = APP_ROOT / "tools"

    backend_target.mkdir(parents=True, exist_ok=True)
    frontend_target.mkdir(parents=True, exist_ok=True)
    tools_target.mkdir(parents=True, exist_ok=True)

    copy_tree(BACKEND_DIR / "app", backend_target / "app")
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

    copy_tree(FRONTEND_DIR / "dist", frontend_target / "dist")
    copy_tree(FRONTEND_DIR / "public", frontend_target / "public")

    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        copy_file(Path(ffmpeg_path), tools_target / "ffmpeg.exe")

    write_file(
        APP_ROOT / "Launch Interactive Avatar.bat",
        r"""@echo off
setlocal
set "ROOT=%~dp0"
set "PYTHON=%ROOT%python\python.exe"
set "PATH=%ROOT%tools;%ROOT%python;%ROOT%python\DLLs;%PATH%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok = $false; try { $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8788/health -TimeoutSec 2; if ($r.StatusCode -eq 200) { $ok = $true } } catch {}; if (-not $ok) { Start-Process -FilePath '%PYTHON%' -ArgumentList '%ROOT%backend\run_server.py' -WorkingDirectory '%ROOT%backend' }; for ($i=0; $i -lt 60; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8788/health -TimeoutSec 2; if ($r.StatusCode -eq 200) { Start-Process 'http://127.0.0.1:8788'; exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; Start-Process 'http://127.0.0.1:8788'"
""",
    )

    write_file(
        APP_ROOT / "Uninstall Interactive Avatar.bat",
        r"""@echo off
setlocal
set "TARGET=%~dp0"
set "DESKTOP=%USERPROFILE%\Desktop\Interactive Avatar.lnk"
set "STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Interactive Avatar.lnk"
if exist "%DESKTOP%" del /f /q "%DESKTOP%"
if exist "%STARTMENU%" del /f /q "%STARTMENU%"
cd /d "%TARGET%\.."
rmdir /s /q "%TARGET%"
""",
    )


def write_installer_support() -> tuple[Path, Path, Path]:
    install_ps1 = STAGE_ROOT / "create-shortcuts.ps1"
    install_bat = STAGE_ROOT / "install.bat"
    payload_zip = Path(
        shutil.make_archive(str(STAGE_ROOT / "app_payload"), "zip", root_dir=APP_ROOT)
    )

    write_file(
        install_ps1,
        r"""param([string]$InstallDir)
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$entries = @(
  @{Path=(Join-Path $desktop "Interactive Avatar.lnk"); Target=(Join-Path $InstallDir "Launch Interactive Avatar.bat")},
  @{Path=(Join-Path $startMenu "Interactive Avatar.lnk"); Target=(Join-Path $InstallDir "Launch Interactive Avatar.bat")}
)
foreach ($entry in $entries) {
  $shortcut = $shell.CreateShortcut($entry.Path)
  $shortcut.TargetPath = $entry.Target
  $shortcut.WorkingDirectory = $InstallDir
  $shortcut.IconLocation = (Join-Path $InstallDir "python\python.exe")
  $shortcut.Save()
}
""",
    )

    write_file(
        install_bat,
        r"""@echo off
setlocal
set "TARGET=%LocalAppData%\Programs\Interactive Avatar"
echo Installing Interactive Avatar to "%TARGET%"...
if exist "%TARGET%" rmdir /s /q "%TARGET%"
mkdir "%TARGET%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath 'app_payload.zip' -DestinationPath '%TARGET%' -Force"
powershell -NoProfile -ExecutionPolicy Bypass -File "create-shortcuts.ps1" -InstallDir "%TARGET%"
start "" "%TARGET%\Launch Interactive Avatar.bat"
echo Installation finished.
exit /b 0
""",
    )

    return install_bat, install_ps1, payload_zip


def write_iexpress_sed(files: list[Path]) -> Path:
    sed_path = STAGE_ROOT / "installer.sed"
    strings = []
    source_entries = []
    for index, file_path in enumerate(files):
        key = f"FILE{index}"
        strings.append(f"{key}={file_path.name}")
        source_entries.append(f"%{key}%=")
    content = "\n".join(
        [
            "[Version]",
            "Class=IEXPRESS",
            "SEDVersion=3",
            "[Options]",
            "PackagePurpose=InstallApp",
            "ShowInstallProgramWindow=1",
            "HideExtractAnimation=0",
            "UseLongFileName=1",
            "InsideCompressed=0",
            "CAB_FixedSize=0",
            "CAB_ResvCodeSigning=0",
            "RebootMode=N",
            "InstallPrompt=",
            "DisplayLicense=",
            "FinishMessage=Interactive Avatar has been installed.",
            f"TargetName={INSTALLER_PATH}",
            "FriendlyName=Interactive Avatar Installer",
            "AppLaunched=install.bat",
            "PostInstallCmd=<None>",
            "AdminQuietInstCmd=install.bat",
            "UserQuietInstCmd=install.bat",
            "SourceFiles=SourceFiles",
            "[Strings]",
            *strings,
            "[SourceFiles]",
            f"SourceFiles0={STAGE_ROOT}\\",
            "[SourceFiles0]",
            *source_entries,
        ]
    )
    write_file(sed_path, content)
    return sed_path


def build_installer() -> None:
    install_bat, install_ps1, payload_zip = write_installer_support()
    sed_path = write_iexpress_sed([install_bat, install_ps1, payload_zip])
    run(["iexpress.exe", "/N", str(sed_path)], cwd=STAGE_ROOT)


def main() -> None:
    BUILD_ROOT.mkdir(parents=True, exist_ok=True)
    build_frontend()
    stage_application()
    build_installer()
    print(f"\nInstaller created: {INSTALLER_PATH}")


if __name__ == "__main__":
    main()
