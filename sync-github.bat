@echo off
echo ====================================================
echo  Internet Archive PDF Downloader - GitHub Sync Tool
echo  Developed by Abu Saleh (https://abusaleh.pro.bd/)
echo ====================================================
echo.

git status
echo.

set /p commit_msg="Enter commit message (or press Enter for default update): "
if "%commit_msg%"=="" set commit_msg=Update Internet Archive PDF Downloader

echo.
echo [1/3] Staging changes...
git add .

echo [2/3] Committing changes...
git commit -m "%commit_msg%"

echo [3/3] Pushing to GitHub (main)...
git push origin main

echo.
echo ====================================================
echo  Sync Complete! Check: https://github.com/asfsaleh/internet-archive-pdf-downloader
echo ====================================================
pause
