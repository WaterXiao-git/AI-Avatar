using System.Diagnostics;
using System.Reflection;
using System.Windows.Forms;

internal static class Program
{
    private const string AppName = "原生瞬联";
    private const string LauncherFileName = "原生瞬联.exe";
    private static readonly string DefaultInstallDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Programs",
        AppName
    );

    [STAThread]
    private static int Main(string[] args)
    {
        var quiet = args.Any(arg => string.Equals(arg, "--quiet", StringComparison.OrdinalIgnoreCase));
        var noLaunch = args.Any(arg => string.Equals(arg, "--no-launch", StringComparison.OrdinalIgnoreCase));
        var cliInstallDir = TryGetArgumentValue(args, "--install-dir");

        try
        {
            if (quiet)
            {
                var installDir = string.IsNullOrWhiteSpace(cliInstallDir) ? DefaultInstallDir : cliInstallDir!;
                InstallTo(installDir, !noLaunch);
                return 0;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm(DefaultInstallDir, noLaunch));
            return 0;
        }
        catch (Exception ex)
        {
            if (quiet)
            {
                Console.Error.WriteLine(ex);
            }
            else
            {
                MessageBox.Show(
                    ex.ToString(),
                    $"{AppName} 安装失败",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
            return 1;
        }
    }

    private static string? TryGetArgumentValue(string[] args, string key)
    {
        for (var i = 0; i < args.Length; i++)
        {
            if (string.Equals(args[i], key, StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                return args[i + 1].Trim().Trim('"');
            }

            if (args[i].StartsWith($"{key}=", StringComparison.OrdinalIgnoreCase))
            {
                return args[i][(key.Length + 1)..].Trim().Trim('"');
            }
        }

        return null;
    }

    internal static void InstallTo(string installDir, bool launchAfterInstall)
    {
        var fullInstallDir = Path.GetFullPath(installDir);
        var tempDir = Path.Combine(Path.GetTempPath(), $"yuanshengshunlian-installer-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        try
        {
            var payloadPath = Path.Combine(tempDir, "app_payload.7z");
            var sevenZipExe = Path.Combine(tempDir, "7z.exe");
            var sevenZipDll = Path.Combine(tempDir, "7z.dll");

            ExtractResource("Payload.app_payload.7z", payloadPath);
            ExtractResource("Payload.7z.exe", sevenZipExe);
            ExtractResource("Payload.7z.dll", sevenZipDll);

            if (Directory.Exists(fullInstallDir))
            {
                Directory.Delete(fullInstallDir, true);
            }
            Directory.CreateDirectory(fullInstallDir);

            var process = Process.Start(new ProcessStartInfo
            {
                FileName = sevenZipExe,
                Arguments = $"x -y \"{payloadPath}\" -o\"{fullInstallDir}\"",
                WorkingDirectory = tempDir,
                UseShellExecute = false,
                CreateNoWindow = true,
            });

            process?.WaitForExit();
            if (process is null || process.ExitCode != 0)
            {
                throw new InvalidOperationException($"7-Zip 解压失败，退出码：{process?.ExitCode}。");
            }

            InstallDesktopEntrypoints(fullInstallDir);

            if (launchAfterInstall)
            {
                StartProcess(Path.Combine(fullInstallDir, LauncherFileName), "--no-browser", fullInstallDir);
            }
        }
        finally
        {
            try
            {
                if (Directory.Exists(tempDir))
                {
                    Directory.Delete(tempDir, true);
                }
            }
            catch
            {
            }
        }
    }

    private static void InstallDesktopEntrypoints(string installDir)
    {
        var launcherPath = Path.Combine(installDir, LauncherFileName);
        if (!File.Exists(launcherPath))
        {
            throw new FileNotFoundException($"安装完成后未找到启动程序：{launcherPath}");
        }

        var desktopTarget = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            $"{AppName}.lnk"
        );
        var startMenuTarget = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),
            "Programs",
            $"{AppName}.lnk"
        );

        CreateShortcut(desktopTarget, launcherPath, installDir);
        CreateShortcut(startMenuTarget, launcherPath, installDir);
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string workingDirectory)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(shortcutPath)!);
        var shellType = Type.GetTypeFromProgID("WScript.Shell")
            ?? throw new InvalidOperationException("无法创建快捷方式所需的 WScript.Shell 对象。");
        var shell = Activator.CreateInstance(shellType)
            ?? throw new InvalidOperationException("无法实例化 WScript.Shell。");
        dynamic shortcut = shellType.InvokeMember(
            "CreateShortcut",
            BindingFlags.InvokeMethod,
            null,
            shell,
            new object[] { shortcutPath }
        );
        shortcut.TargetPath = targetPath;
        shortcut.WorkingDirectory = workingDirectory;
        shortcut.IconLocation = targetPath;
        shortcut.Save();
    }

    private static void ExtractResource(string resourceName, string outputPath)
    {
        var assembly = Assembly.GetExecutingAssembly();
        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new FileNotFoundException($"未找到内嵌资源：{resourceName}");
        using var file = File.Create(outputPath);
        stream.CopyTo(file);
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

internal sealed class InstallerForm : Form
{
    private readonly TextBox _pathBox;
    private readonly CheckBox _launchCheckbox;
    private readonly Button _installButton;
    private readonly Label _statusLabel;

    public InstallerForm(string defaultInstallDir, bool noLaunch)
    {
        Text = "原生瞬联 安装向导";
        Width = 640;
        Height = 260;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;

        var title = new Label
        {
            Left = 20,
            Top = 20,
            Width = 580,
            Height = 30,
            Text = "安装 原生瞬联",
            Font = new Font(Font.FontFamily, 13, FontStyle.Bold),
        };

        var desc = new Label
        {
            Left = 20,
            Top = 58,
            Width = 580,
            Height = 34,
            Text = "请选择安装位置。安装完成后会创建桌面和开始菜单快捷方式。",
        };

        _pathBox = new TextBox
        {
            Left = 20,
            Top = 105,
            Width = 470,
            Text = defaultInstallDir,
        };

        var browseButton = new Button
        {
            Left = 500,
            Top = 103,
            Width = 90,
            Height = 28,
            Text = "浏览...",
        };
        browseButton.Click += (_, _) => BrowseFolder();

        _launchCheckbox = new CheckBox
        {
            Left = 20,
            Top = 145,
            Width = 260,
            Checked = !noLaunch,
            Text = "安装完成后立即启动",
        };

        _installButton = new Button
        {
            Left = 480,
            Top = 175,
            Width = 110,
            Height = 32,
            Text = "安装",
        };
        _installButton.Click += async (_, _) => await InstallAsync();

        _statusLabel = new Label
        {
            Left = 20,
            Top = 182,
            Width = 430,
            Height = 26,
            Text = "准备开始安装。",
        };

        Controls.Add(title);
        Controls.Add(desc);
        Controls.Add(_pathBox);
        Controls.Add(browseButton);
        Controls.Add(_launchCheckbox);
        Controls.Add(_installButton);
        Controls.Add(_statusLabel);
    }

    private void BrowseFolder()
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "请选择安装目录",
            ShowNewFolderButton = true,
            UseDescriptionForTitle = true,
            SelectedPath = _pathBox.Text,
        };

        if (dialog.ShowDialog(this) == DialogResult.OK && !string.IsNullOrWhiteSpace(dialog.SelectedPath))
        {
            _pathBox.Text = dialog.SelectedPath;
        }
    }

    private async Task InstallAsync()
    {
        var installDir = _pathBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(installDir))
        {
            MessageBox.Show(this, "请先选择安装目录。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _installButton.Enabled = false;
        _statusLabel.Text = "正在安装，请稍候...";

        try
        {
            await Task.Run(() => Program.InstallTo(installDir, _launchCheckbox.Checked));
            _statusLabel.Text = "安装完成。";
            MessageBox.Show(this, "安装完成。", "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
            Close();
        }
        catch (Exception ex)
        {
            _statusLabel.Text = "安装失败。";
            MessageBox.Show(this, ex.Message, "安装失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _installButton.Enabled = true;
        }
    }
}
