#!/usr/bin/env node
// Wrapper that filters secretctl's stdout to remove non-JSON lines before MCP

const { spawn } = require("child_process");

const child = spawn(
  "C:\\Users\\8\\.secretctl\\bin\\secretctl.exe",
  ["mcp-server"],
  {
    env: { ...process.env, SECRETCTL_PASSWORD: "LSH102605" },
    stdio: ["pipe", "pipe", "inherit"],
  }
);

child.stdout.on("data", (data) => {
  // Only forward lines that look like JSON-RPC
  const text = data.toString();
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.trim().startsWith("{")) {
      process.stdout.write(line + "\n");
    }
  }
});

child.on("exit", (code) => process.exit(code));

// Forward stdin to child
process.stdin.pipe(child.stdin);
