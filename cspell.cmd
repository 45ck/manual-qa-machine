@echo off
setlocal

if "%~1"=="--no-progress" (
  if "%~2"=="{src}/**/*" (
    call node_modules\.bin\cspell.cmd --no-progress README.md src commands skills test
    exit /b %errorlevel%
  )
)

call node_modules\.bin\cspell.cmd %*
