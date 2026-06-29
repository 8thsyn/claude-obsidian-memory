@echo off
REM secretctl MCP wrapper - redirects startup warnings to stderr
set SECRETCTL_PASSWORD=LSH102605
"C:\Users\8\.secretctl\bin\secretctl.exe" mcp-server 1>&2
