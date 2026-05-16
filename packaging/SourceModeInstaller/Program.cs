using System.Diagnostics;
using System.Text;
using System.Windows.Forms;

static class Program
{
    private const string AppName = "Interactive Avatar";
    private static readonly string InstallDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Programs",
        AppName
    );

    static int Main(string[] args)
    {
        try
        {
            var launchAfterInstall = !args.Any(arg => string.Equals(arg, "--no-launch", StringComparison.OrdinalIgnoreCase));
            var sourceRoot = ResolveSourceRoot(args);
            Directory.CreateDirectory(InstallDir);

            var launcherPath = Path.Combine(InstallDir, "Launch Interactive Avatar.bat");
            var uninstallPath = Path.Combine(InstallDir, "Uninstall Interactive Avatar.bat");
            var sourceMarkerPath = Path.Combine(InstallDir, "source_root.txt");

            File.WriteAllText(launcherPath, BuildLauncherScript(), new UTF8Encoding(false));
            File.WriteAllText(uninstallPath, BuildUninstallScript(), new UTF8Encoding(false));
            File.WriteAllText(sourceMarkerPath, sourceRoot, new UTF8Encoding(false));

            InstallDesktopEntrypoints(launcherPath);

            Console.WriteLine($"Installed to: {InstallDir}");
            Console.WriteLine($"Source root: {sourceRoot}");

            if (launchAfterInstall)
            {
                StartProcess(launcherPath, string.Empty, InstallDir);
            }

            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex);
            return 1;
        }
    }

    private static string ResolveSourceRoot(string[] args)
    {
        var overrideRoot = TryGetSourceRootOverride(args);
        if (!string.IsNullOrWhiteSpace(overrideRoot))
        {
            return EnsureValidSourceRoot(overrideRoot);
        }

        var baseDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var candidate = Path.GetFullPath(Path.Combine(baseDir, ".."));
        if (IsValidSourceRoot(candidate))
        {
            return candidate;
        }

        return PromptForSourceRoot();
    }

    private static string? TryGetSourceRootOverride(string[] args)
    {
        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            if (arg.StartsWith("--source-root=", StringComparison.OrdinalIgnoreCase))
            {
                return arg["--source-root=".Length..].Trim().Trim('"');
            }

            if (string.Equals(arg, "--source-root", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                return args[i + 1].Trim().Trim('"');
            }
        }

        return null;
    }

    private static string PromptForSourceRoot()
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Select the Interactive Avatar source folder",
            ShowNewFolderButton = false,
            UseDescriptionForTitle = true,
        };

        while (true)
        {
            var result = dialog.ShowDialog();
            if (result != DialogResult.OK || string.IsNullOrWhiteSpace(dialog.SelectedPath))
            {
                throw new InvalidOperationException("No valid source folder was selected. Installation was cancelled.");
            }

            if (IsValidSourceRoot(dialog.SelectedPath))
            {
                return Path.GetFullPath(dialog.SelectedPath);
            }

            MessageBox.Show(
                "The selected folder is not a valid Interactive Avatar source folder. It must contain backend\\run_server.py and frontend\\dist\\index.html.",
                AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning
            );
        }
    }

    private static string EnsureValidSourceRoot(string candidate)
    {
        var fullPath = Path.GetFullPath(candidate);
        if (!IsValidSourceRoot(fullPath))
        {
            throw new FileNotFoundException($"Source-mode installer could not find required project files under: {fullPath}");
        }

        return fullPath;
    }

    private static bool IsValidSourceRoot(string? candidate)
    {
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return false;
        }

        var fullPath = Path.GetFullPath(candidate);
        var backendEntry = Path.Combine(fullPath, "backend", "run_server.py");
        var frontendIndex = Path.Combine(fullPath, "frontend", "dist", "index.html");
        return File.Exists(backendEntry) && File.Exists(frontendIndex);
    }

    private static void InstallDesktopEntrypoints(string launcherPath)
    {
        var desktopTarget = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            "Launch Interactive Avatar.bat"
        );
        var startMenuTarget = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),
            "Programs",
            "Launch Interactive Avatar.bat"
        );

        Directory.CreateDirectory(Path.GetDirectoryName(startMenuTarget)!);
        File.Copy(launcherPath, desktopTarget, true);
        File.Copy(launcherPath, startMenuTarget, true);
    }

    private static string BuildLauncherScript()
    {
        const string resolveSourceCommand = "$src = $env:SOURCE_ROOT; $valid = $src -and (Test-Path (Join-Path $src 'backend\\run_server.py')) -and (Test-Path (Join-Path $src 'frontend\\dist\\index.html')); if (-not $valid) { Add-Type -AssemblyName System.Windows.Forms; $dlg = New-Object System.Windows.Forms.FolderBrowserDialog; $dlg.Description = 'Select the Interactive Avatar source folder'; $dlg.ShowNewFolderButton = $false; if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }; $candidate = $dlg.SelectedPath; $ok = (Test-Path (Join-Path $candidate 'backend\\run_server.py')) -and (Test-Path (Join-Path $candidate 'frontend\\dist\\index.html')); if (-not $ok) { [System.Windows.Forms.MessageBox]::Show('The selected folder is not a valid Interactive Avatar source folder.','Interactive Avatar'); exit 3 }; Set-Content -LiteralPath $env:SOURCE_FILE -Value $candidate -Encoding UTF8 }";
        const string healthCheckCommand = "try { $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8788/health -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1";

        return string.Join(
            Environment.NewLine,
            [
                "@echo off",
                "setlocal",
                "set \"INSTALL_DIR=%~dp0\"",
                "set \"SOURCE_FILE=%INSTALL_DIR%source_root.txt\"",
                "set \"SOURCE_ROOT=\"",
                "if exist \"%SOURCE_FILE%\" for /f \"usebackq delims=\" %%I in (\"%SOURCE_FILE%\") do set \"SOURCE_ROOT=%%I\"",
                "set \"NO_BROWSER=0\"",
                "if /I \"%~1\"==\"--no-browser\" set \"NO_BROWSER=1\"",
                "if exist \"D:\\Python\\python.exe\" (",
                "  set \"PYTHON=D:\\Python\\python.exe\"",
                ") else (",
                "  set \"PYTHON=python\"",
                ")",
                $"powershell -NoProfile -ExecutionPolicy Bypass -Command \"{resolveSourceCommand}\"",
                "if errorlevel 1 exit /b 1",
                "set \"SOURCE_ROOT=\"",
                "if exist \"%SOURCE_FILE%\" for /f \"usebackq delims=\" %%I in (\"%SOURCE_FILE%\") do set \"SOURCE_ROOT=%%I\"",
                "if not exist \"%SOURCE_ROOT%\\backend\\run_server.py\" exit /b 1",
                "set \"PATH=%SOURCE_ROOT%\\tools;%PATH%\"",
                "",
                $"powershell -NoProfile -ExecutionPolicy Bypass -Command \"{healthCheckCommand}\"",
                "if errorlevel 1 (",
                "  powershell -NoProfile -ExecutionPolicy Bypass -Command \"Start-Process -WindowStyle Hidden -FilePath '%PYTHON%' -ArgumentList 'run_server.py' -WorkingDirectory '%SOURCE_ROOT%\\backend'\"",
                ")",
                "",
                "for /L %%I in (1,1,60) do (",
                $"  powershell -NoProfile -ExecutionPolicy Bypass -Command \"{healthCheckCommand}\"",
                "  if not errorlevel 1 goto health_ok",
                "  timeout /t 1 /nobreak >nul",
                ")",
                "goto end",
                "",
                ":health_ok",
                "if \"%NO_BROWSER%\"==\"0\" start \"\" \"http://127.0.0.1:8788\"",
                "",
                ":end"
            ]
        );
    }

    private static string BuildUninstallScript()
    {
        return @"@echo off
setlocal
set ""DESKTOP=%USERPROFILE%\Desktop\Launch Interactive Avatar.bat""
set ""STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Launch Interactive Avatar.bat""
if exist ""%DESKTOP%"" del /f /q ""%DESKTOP%""
if exist ""%STARTMENU%"" del /f /q ""%STARTMENU%""
cd /d ""%~dp0..""
rmdir /s /q ""%~dp0""
";
    }

    private static void StartProcess(string fileName, string arguments, string workingDirectory)
    {
        var info = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            UseShellExecute = true,
        };
        Process.Start(info);
    }
}
