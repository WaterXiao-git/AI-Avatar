from __future__ import annotations

import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path


APP_URL = "http://127.0.0.1:8788"
HEALTH_URL = f"{APP_URL}/health"


def app_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def backend_executable() -> Path:
    root = app_root()
    candidate = root / "backend" / "InteractiveAvatarBackend.exe"
    if candidate.exists():
        return candidate
    raise FileNotFoundError(f"Backend executable not found: {candidate}")


def health_ready() -> bool:
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=1.5) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def start_backend() -> None:
    exe_path = backend_executable()
    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_CONSOLE
    subprocess.Popen(
        [str(exe_path)],
        cwd=str(exe_path.parent),
        creationflags=creationflags,
    )


def ensure_backend_ready(timeout_s: float = 30.0) -> None:
    if health_ready():
        return
    start_backend()
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if health_ready():
            return
        time.sleep(0.5)
    raise TimeoutError("Interactive Avatar backend did not become ready in time.")


def main() -> int:
    ensure_backend_ready()
    webbrowser.open(APP_URL)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
