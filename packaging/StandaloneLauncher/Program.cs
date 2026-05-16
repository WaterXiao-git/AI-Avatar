using System.Diagnostics;
using System.Net.Http;
using System.Windows.Forms;

internal static class Program
{
    private const string AppName = "原生瞬联";
    private const string AppUrl = "http://127.0.0.1:8788";
    private static readonly string HealthUrl = $"{AppUrl}/health";

    [STAThread]
    private static async Task<int> Main(string[] args)
    {
        var openBrowser = !args.Any(arg => string.Equals(arg, "--no-browser", StringComparison.OrdinalIgnoreCase));
        try
        {
            var root = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            var pythonExe = Path.Combine(root, "python", "python.exe");
            var backendDir = Path.Combine(root, "backend");
            var backendEntry = Path.Combine(backendDir, "run_server.py");

            if (!File.Exists(pythonExe) || !File.Exists(backendEntry))
            {
                throw new FileNotFoundException("安装目录中的运行环境不完整，未找到 python.exe 或 run_server.py。");
            }

            if (!await HealthReady().ConfigureAwait(false))
            {
                StartBackend(pythonExe, backendDir, backendEntry, root);
            }

            var deadline = DateTime.UtcNow.AddSeconds(30);
            while (DateTime.UtcNow < deadline)
            {
                if (await HealthReady().ConfigureAwait(false))
                {
                    if (openBrowser)
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = AppUrl,
                            UseShellExecute = true,
                        });
                    }
                    return 0;
                }

                await Task.Delay(500).ConfigureAwait(false);
            }

            throw new TimeoutException("原生瞬联启动超时，本地服务未能在预期时间内完成就绪。");
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                ex.Message,
                AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return 1;
        }
    }

    private static async Task<bool> HealthReady()
    {
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            using var response = await client.GetAsync(HealthUrl).ConfigureAwait(false);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private static void StartBackend(string pythonExe, string backendDir, string backendEntry, string root)
    {
        var info = new ProcessStartInfo
        {
            FileName = pythonExe,
            Arguments = $"\"{backendEntry}\"",
            WorkingDirectory = backendDir,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };

        var pythonHome = Path.Combine(root, "python");
        info.Environment["PATH"] = string.Join(
            Path.PathSeparator,
            new[]
            {
                Path.Combine(root, "tools"),
                pythonHome,
                Path.Combine(pythonHome, "DLLs"),
                Environment.GetEnvironmentVariable("PATH") ?? string.Empty,
            }
        );
        info.Environment["PYTHONHOME"] = pythonHome;
        info.Environment["PYTHONPATH"] = string.Join(
            Path.PathSeparator,
            new[]
            {
                backendDir,
                Path.Combine(pythonHome, "Lib"),
                Path.Combine(pythonHome, "Lib", "site-packages"),
            }
        );

        Process.Start(info);
    }
}
