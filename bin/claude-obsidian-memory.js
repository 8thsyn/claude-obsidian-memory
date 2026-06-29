#!/usr/bin/env node

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  appendFileSync,
} from "fs";
import { join, dirname, basename } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import { stdin, exit } from "process";

const __dirname = dirname(
  new URL(import.meta.url).pathname.replace(/^\/[a-z]\//i, (m) => m[1] + ":/"),
);
const PKG_ROOT = dirname(__dirname);
const CONFIG_DIR = join(homedir(), ".config", "obsidian-memory");
const DEFAULT_VAULT = join(homedir(), "Documents", "Obsidian Memory");

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    stdin.setEncoding("utf-8");
    stdin.on("data", (c) => (data += c));
    stdin.on("end", () => resolve(data));
  });
}

function loadConfig() {
  const envPath = join(CONFIG_DIR, "config.env");
  if (!existsSync(envPath)) return {};
  const config = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([^=#]+)=(.*)$/);
    if (m) config[m[1].trim()] = m[2].trim();
  }
  return config;
}

function vaultPath() {
  const config = loadConfig();
  return config.OBSIDIAN_VAULT_PATH || DEFAULT_VAULT;
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function now() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function frontmatter(fields) {
  let out = "---\n";
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) out += `${k}: ${v}\n`;
  }
  return out + "---\n\n";
}

function parseFrontmatter(content) {
  const result = {};
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (m) {
    for (const line of m[1].split("\n")) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (kv) result[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
    }
  }
  return result;
}

function vaultSearch(vault, keywords, limit) {
  const results = [];
  for (const dirName of ["Tools", "Notes"]) {
    const dir = join(vault, dirName);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      if (results.length >= limit) break;
      const content = readFileSync(join(dir, file), "utf-8").toLowerCase();
      const matchCount = keywords.filter((k) => content.includes(k)).length;
      if (matchCount >= Math.ceil(keywords.length / 2)) {
        const fm = parseFrontmatter(content);
        results.push({
          path: `${dirName}/${file}`,
          description: fm.description || "",
          type: fm.type || "note",
          score: matchCount / keywords.length,
        });
      }
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function gitAutoCommit(vault) {
  try {
    const gitDir = join(vault, ".git");
    if (!existsSync(gitDir)) return;
    execSync(`git -C "${vault}" add -A`, { stdio: "pipe", timeout: 10000 });
    execSync(
      `git -C "${vault}" commit -m "chore: auto-save vault changes" --allow-empty --no-gpg-sign`,
      { stdio: "pipe", timeout: 15000 },
    );
  } catch {}
}

async function cmdSetup(args = {}) {
  const vault = args.vault || vaultPath();
  for (const dir of ["Tools", "Journals", "Notes"]) ensureDir(join(vault, dir));
  ensureDir(CONFIG_DIR);
  writeFileSync(
    join(CONFIG_DIR, "config.env"),
    `OBSIDIAN_VAULT_PATH=${vault}\n`,
    "utf-8",
  );
  console.log(`Vault initialized at ${vault}`);
  console.log(`Config written to ${join(CONFIG_DIR, "config.env")}`);
}

async function cmdStatus() {
  const vault = vaultPath();
  const exists = existsSync(vault);
  console.log(`Vault: ${vault}`);
  console.log(`Status: ${exists ? "active" : "not found"}`);

  if (!exists) return;

  let total = 0;
  for (const dir of readdirSync(vault)) {
    const full = join(vault, dir);
    if (statSync(full).isDirectory()) {
      const files = readdirSync(full).filter((f) => f.endsWith(".md"));
      if (files.length) {
        console.log(`  ${dir}/: ${files.length} files`);
        total += files.length;
      }
    }
  }
  console.log(`Total notes: ${total}`);

  const journalsDir = join(vault, "Journals");
  if (existsSync(journalsDir)) {
    const journals = readdirSync(journalsDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse();
    if (journals.length)
      console.log(`Last journal: ${journals[0].replace(".md", "")}`);
  }

  const config = loadConfig();
  const configPath = join(CONFIG_DIR, "config.env");
  console.log(`Config: ${existsSync(configPath) ? "found" : "missing"}`);
  if (existsSync(join(vault, ".git"))) console.log("Git: enabled");
}

async function cmdHookSessionStart() {
  const vault = vaultPath();
  if (!existsSync(vault)) {
    console.log("[obsidian-memory] Vault not found. Run setup first.");
    return;
  }

  const overview = [];
  for (const dirName of ["Tools", "Notes", "Journals"]) {
    const dir = join(vault, dirName);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .sort()) {
      const fm = parseFrontmatter(readFileSync(join(dir, file), "utf-8"));
      overview.push({
        path: `${dirName}/${file}`,
        type: fm.type || "note",
        description: fm.description || "",
      });
    }
  }

  if (overview.length) {
    console.log(`[obsidian-memory] Vault loaded: ${overview.length} notes`);
    for (const n of overview.slice(0, 10))
      console.log(`  ${n.path} — ${n.description.slice(0, 80)}`);
    if (overview.length > 10)
      console.log(`  ... and ${overview.length - 10} more`);
  } else {
    console.log(
      "[obsidian-memory] Vault is empty. Use save-memory to add notes.",
    );
  }
}

async function cmdHookSessionEnd() {
  const vault = vaultPath();
  if (!existsSync(vault)) return;

  const journalDir = join(vault, "Journals");
  ensureDir(journalDir);
  const today = new Date().toISOString().slice(0, 10);
  const journalFile = join(journalDir, `${today}.md`);

  if (!existsSync(journalFile)) {
    writeFileSync(
      journalFile,
      frontmatter({
        type: "journal",
        description: `Session ${today}`,
        created_at: now(),
      }) + `# ${today}\n\n`,
      "utf-8",
    );
  }
  appendFileSync(journalFile, `- Activity at ${now()}\n`, "utf-8");

  gitAutoCommit(vault);
}

async function cmdHookUserPromptSubmit() {
  const vault = vaultPath();
  if (!existsSync(vault)) return;

  const payload = await readStdin();
  let promptText = "";
  try {
    const p = JSON.parse(payload);
    promptText = p.prompt || p.text || "";
  } catch {
    promptText = payload;
  }
  if (!promptText) return;

  const stopWords = new Set([
    "the",
    "this",
    "that",
    "and",
    "for",
    "are",
    "not",
    "but",
    "you",
    "all",
    "can",
    "has",
    "was",
    "were",
    "what",
    "when",
    "where",
    "how",
    "why",
    "who",
    "which",
    "will",
    "with",
    "have",
    "from",
    "your",
  ]);
  const keywords = [
    ...new Set(
      promptText
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w)),
    ),
  ];

  if (keywords.length < 2) return;
  const matches = vaultSearch(vault, keywords, 3);
  if (matches.length) {
    console.log(
      `[obsidian-memory] Matched: ${matches.map((m) => m.path).join(", ")}`,
    );
  }
}

async function cmdVaultSearch(args) {
  const vault = vaultPath();
  if (!existsSync(vault)) {
    console.error("Vault not found. Run setup first.");
    exit(1);
  }

  const keywords = (args.keywords || args._.slice(2).join(" ") || "")
    .split(/\s+/)
    .filter(Boolean);
  if (!keywords.length) {
    console.error("Usage: vault search --keywords <terms>");
    exit(1);
  }

  const results = vaultSearch(vault, keywords, 20);
  if (!results.length) {
    console.log("No matches.");
    return;
  }

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  console.log(`Found ${results.length} matches:\n`);
  for (const r of results) {
    console.log(`  ${r.path}`);
    console.log(`    Type: ${r.type}  Score: ${(r.score * 100).toFixed(0)}%`);
    if (r.description) console.log(`    ${r.description.slice(0, 120)}`);
    console.log();
  }
}

async function cmdVaultList() {
  const vault = vaultPath();
  if (!existsSync(vault)) {
    console.error("Vault not found.");
    exit(1);
  }

  let total = 0;
  for (const dirName of ["Tools", "Notes", "Journals"]) {
    const dir = join(vault, dirName);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    if (!files.length) continue;
    console.log(`\n${dirName}/`);
    for (const file of files) {
      const fm = parseFrontmatter(readFileSync(join(dir, file), "utf-8"));
      console.log(`  ${file}  ${fm.description || "(no description)"}`);
      total++;
    }
  }
  console.log(`\nTotal: ${total} notes`);
}

async function cmdVaultAudit() {
  const vault = vaultPath();
  if (!existsSync(vault)) {
    console.error("Vault not found.");
    exit(1);
  }

  let issues = [];

  for (const dirName of ["Tools", "Notes"]) {
    const dir = join(vault, dirName);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const content = readFileSync(join(dir, file), "utf-8");
      const fm = parseFrontmatter(content);

      if (!fm.type)
        issues.push(`${dirName}/${file}: missing type in frontmatter`);
      if (!fm.description)
        issues.push(`${dirName}/${file}: missing description in frontmatter`);
      if (!fm.created_at)
        issues.push(`${dirName}/${file}: missing created_at in frontmatter`);
    }
  }

  if (issues.length) {
    console.log(`Found ${issues.length} issues:\n`);
    for (const issue of issues) console.log(`  - ${issue}`);
  } else {
    console.log("No issues found. All notes have valid frontmatter.");
  }
}

async function cmdUsage() {
  console.log(
    "Usage tracking not yet implemented. Coming in a future release.",
  );
}

const args = process.argv.slice(2);
const parsed = { _: [], json: false, keywords: null, vault: null };
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") parsed.json = true;
  else if (args[i] === "--keywords") parsed.keywords = args[++i];
  else if (args[i] === "--vault") parsed.vault = args[++i];
  else parsed._.push(args[i]);
}

const cmds = {
  setup: cmdSetup,
  status: cmdStatus,
  usage: cmdUsage,
  "hook session-start": cmdHookSessionStart,
  "hook session-end": cmdHookSessionEnd,
  "hook user-prompt-submit": cmdHookUserPromptSubmit,
  "vault search": cmdVaultSearch,
  "vault list": cmdVaultList,
  "vault audit": cmdVaultAudit,
};

const key2 = parsed._.slice(0, 2).join(" ");
const key = cmds[key2] ? key2 : parsed._[0] || "";
const handler = cmds[key];
if (!handler) {
  console.log(
    "Usage: claude-obsidian-memory <setup|status|hook|vault> [options]",
  );
  console.log("Commands:");
  console.log("  setup                    Initialize the vault");
  console.log("  status                   Show vault status");
  console.log("  usage                    Show token usage (coming soon)");
  console.log("  hook session-start       SessionStart lifecycle hook");
  console.log("  hook session-end         SessionEnd lifecycle hook");
  console.log("  hook user-prompt-submit  UserPromptSubmit lifecycle hook");
  console.log("  vault search --keywords  Search notes by keyword");
  console.log("  vault list               List all notes");
  console.log("  vault audit              Check frontmatter integrity");
  exit(1);
}
handler(parsed).catch((e) => {
  console.error("Error:", e.message);
  exit(1);
});
