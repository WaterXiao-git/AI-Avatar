@echo off
setlocal
cd /d "D:\Code\Develop\4C Avatar\Interactive Avatar"
echo === Checking remotes ===
D:\xz\Git\bin\git.exe remote -v
echo === Current branch ===
D:\xz\Git\bin\git.exe branch
echo === Status ===
D:\xz\Git\bin\git.exe status --short
echo === Adding remote ===
D:\xz\Git\bin\git.exe remote remove origin 2>nul
D:\xz\Git\bin\git.exe remote add origin https://github.com/WaterXiao-git/AI-Avatar.git
echo === Setting remote URL ===
D:\xz\Git\bin\git.exe remote set-url origin https://github.com/WaterXiao-git/AI-Avatar.git
echo === Adding all files ===
D:\xz\Git\bin\git.exe add -A
echo === Committing ===
D:\xz\Git\bin\git.exe commit -m "Full project: Interactive Avatar system"
echo === Pushing (force) ===
D:\xz\Git\bin\git.exe push -u origin main --force
echo === Done ===
endlocal
