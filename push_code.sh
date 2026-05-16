#!/bin/bash
set -e
echo "=== Git Remote ==="
git remote -v
echo "=== Git Branch ==="
git branch
echo "=== Git Status ==="
git status --short
echo "=== Adding remote ==="
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/WaterXiao-git/AI-Avatar.git
echo "=== Setting URL ==="
git remote set-url origin https://github.com/WaterXiao-git/AI-Avatar.git
echo "=== Adding all files ==="
git add -A
echo "=== Committing ==="
git commit -m "Full project: Interactive Avatar system" || true
echo "=== Pushing ==="
git push -u origin main --force
echo "=== Done ==="
