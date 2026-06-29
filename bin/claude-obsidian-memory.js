#!/usr/bin/env node

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  appendFileSync,
  readlinkSync,
} from "fs";
import { join, dirname, basename } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import { stdin, exit } from "process";

const __dirname = dirname(
  new URL(import.meta.url).pathname.replace(/^\/[a-z]\//i, (m) => m[1] + ":"),
);
const PKG_ROOT = dirname(__dirname);
const CONFIG_DIR = join(homedir(), ".config", "obsidian-memory");
const DEFAULT_VAULT = join(homedir(), "Documents", "Obsidian Memory");
const TYPES_FILE = join(CONFIG_DIR, "types.yaml");
const DEFAULT_TYPES = [
  "preference",
  "reference",
  "findings",
  "decision",
  "learning",
  "tool",
  "journal",
];

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

function loadMemoryTypes() {
  if (!existsSync(TYPES_FILE)) return DEFAULT_TYPES;
  const content = readFileSync(TYPES_FILE, "utf-8");
  const types = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*-\s+(.+)$/);
    if (m) types.push(m[1].trim());
  }
  return types.length ? types : DEFAULT_TYPES;
}

// ─── Commands ──────────────────────────────────────────────────────────

async function cmdSetup(args = {}) {
  const vault = args.vault || vaultPath();
  for (const dir of ["Tools", "Journals", "Notes"]) ensureDir(join(vault, dir));
  ensureDir(CONFIG_DIR);
  const configPath = join(CONFIG_DIR, "config.env");
  writeFileSync(configPath, `OBSIDIAN_VAULT_PATH=${vault}\n`, "utf-8");

  // Seed default types
  if (!existsSync(TYPES_FILE)) {
    writeFileSync(
      TYPES_FILE,
      DEFAULT_TYPES.map((t) => `- ${t}`).join("\n"),
      "utf-8",
    );
  }

  console.log(`Vault initialized at ${vault}`);
  console.log(`Config written to ${configPath}`);

  // Interactive: prompt to git init
  if (!existsSync(join(vault, ".git"))) {
    console.log("\nTip: enable git tracking for auto-commit on session-end:");
    console.log(`  git -C "${vault}" init`);
    console.log(`  git -C "${vault}" add -A`);
    console.log(`  git -C "${vault}" commit -m "chore: initialize vault"`);
  }
}

async function cmdStatus() {
  const vault = vaultPath();
  const exists = existsSync(vault);
  console.log(`Vault: ${vault}`);
  console.log(`Status: ${exists ? "active" : "not found"}`);

  if (!exists) {
    console.log("\nTo initialize:");
    console.log(`  claude-obsidian-memory setup --vault "${vault}"`);
    return;
  }

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

  const configPath = join(CONFIG_DIR, "config.env");
  console.log(`Config: ${existsSync(configPath) ? "found" : "missing"}`);
  console.log(`Types: ${loadMemoryTypes().length} configured`);
  if (existsSync(join(vault, ".git"))) console.log("Git: enabled");
}

async function cmdHookSessionStart() {
  const vault = vaultPath();
  if (!existsSync(vault)) {
    console.log("[obsidian-memory] Vault not found. Run setup first.");
    console.log("[obsidian-memory]   claude-obsidian-memory setup");
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
    console.log(
      `[obsidian-memory] Memory types: ${loadMemoryTypes().join(", ")}`,
    );
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
      if (!fm.type) issues.push(`${dirName}/${file}: missing type`);
      if (!fm.description)
        issues.push(`${dirName}/${file}: missing description`);
      if (!fm.created_at) issues.push(`${dirName}/${file}: missing created_at`);
    }
  }

  if (issues.length) {
    console.log(`Found ${issues.length} issues:`);
    for (const issue of issues) console.log(`  - ${issue}`);
  } else {
    console.log("No issues found. All notes have valid frontmatter.");
  }
}

async function cmdTypes(args) {
  const action = args._[1] || "list";

  if (action === "list") {
    const types = loadMemoryTypes();
    console.log("Memory types:");
    types.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    return;
  }

  if (action === "add") {
    const type = args._.slice(2).join(" ") || args.type;
    if (!type) {
      console.error("Usage: types add <type-name>");
      exit(1);
    }
    const types = loadMemoryTypes();
    if (types.includes(type)) {
      console.log(`Type "${type}" already exists.`);
      return;
    }
    types.push(type);
    writeFileSync(TYPES_FILE, types.map((t) => `- ${t}`).join("\n"), "utf-8");
    console.log(`Added type: ${type}`);
    return;
  }

  if (action === "remove") {
    const type = args._.slice(2).join(" ") || args.type;
    if (!type) {
      console.error("Usage: types remove <type-name>");
      exit(1);
    }
    let types = loadMemoryTypes();
    if (!types.includes(type)) {
      console.log(`Type "${type}" not found.`);
      return;
    }
    types = types.filter((t) => t !== type);
    writeFileSync(TYPES_FILE, types.map((t) => `- ${t}`).join("\n"), "utf-8");
    console.log(`Removed type: ${type}`);
    return;
  }

  if (action === "reset") {
    writeFileSync(
      TYPES_FILE,
      DEFAULT_TYPES.map((t) => `- ${t}`).join("\n"),
      "utf-8",
    );
    console.log("Reset to default types.");
    return;
  }

  console.error("Usage: types [list|add|remove|reset]");
  exit(1);
}

async function cmdUsage(args = {}) {
  const vault = vaultPath();
  if (!existsSync(vault)) {
    console.error("Vault not found.");
    exit(1);
  }

  // Count tokens across all notes (approximate: 4 chars = 1 token)
  let totalChars = 0;
  let noteCount = 0;
  for (const dirName of ["Tools", "Notes", "Journals"]) {
    const dir = join(vault, dirName);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const content = readFileSync(join(dir, file), "utf-8");
      totalChars += content.length;
      noteCount++;
    }
  }
  const estimatedTokens = Math.round(totalChars / 4);
  console.log("Vault usage:");
  console.log(`  Notes: ${noteCount}`);
  console.log(`  Characters: ${totalChars.toLocaleString()}`);
  console.log(`  Estimated tokens: ${estimatedTokens.toLocaleString()}`);
  console.log(`  Memory types: ${loadMemoryTypes().length}`);

  // Status line output (for Claude Code status bar integration)
  if (args && args.json) {
    console.log(
      JSON.stringify({
        notes: noteCount,
        chars: totalChars,
        tokens: estimatedTokens,
      }),
    );
  }
}

// ─── Arg parsing ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const parsed = { _: [], json: false, keywords: null, vault: null, type: null };
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") parsed.json = true;
  else if (args[i] === "--keywords") parsed.keywords = args[++i];
  else if (args[i] === "--vault") parsed.vault = args[++i];
  else if (args[i] === "--type") parsed.type = args[++i];
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
  "types list": cmdTypes,
  "types add": cmdTypes,
  "types remove": cmdTypes,
  "types reset": cmdTypes,
};

const key2 = parsed._.slice(0, 2).join(" ");
const key = cmds[key2] ? key2 : parsed._[0] || "";
const handler = cmds[key];
if (!handler) {
  console.log("Usage: claude-obsidian-memory <command> [options]");
  console.log("");
  console.log("Commands:");
  console.log("  setup                    Initialize the vault");
  console.log("  status                   Show vault status and health");
  console.log("  usage                    Show approximate token usage");
  console.log("  hook session-start       Load vault context at session start");
  console.log("  hook session-end         Write journal entry and auto-commit");
  console.log("  hook user-prompt-submit  Match prompt against vault notes");
  console.log("  vault search --keywords  Search notes by keyword (--json)");
  console.log("  vault list               List all notes by directory");
  console.log("  vault audit              Check frontmatter integrity");
  console.log("  types list               List memory types");
  console.log("  types add <name>         Add a memory type");
  console.log("  types remove <name>      Remove a memory type");
  console.log("  types reset              Reset to default types");
  exit(1);
}
handler(parsed).catch((e) => {
  console.error("Error:", e.message);
  exit(1);
});
