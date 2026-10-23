#!/usr/bin/env node
/**
 * breaklytix — CLI entry point
 * Usage:
 *   breaklytix login              Validate and save an API key
 *   breaklytix scan               Trigger a server-side scan of the current repo
 *   breaklytix scan --dir <path>  Scan a local directory (no upload)
 *   breaklytix status             Show alerts and fixes
 *   breaklytix watch              Re-scan the current directory every 30s
 */
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const https = require("https");

const RC_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || os.homedir(),
  ".autofixrc"
);
const DEFAULT_API_URL = "https://backend-virid-ten-43.vercel.app";
const API_BASE = (process.env.AUTOFIX_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
const WEB_BASE = (process.env.AUTOFIX_WEB_URL || "https://breaklytix.site").replace(/\/+$/, "");
const MAX_SCAN_FILE_BYTES = 512 * 1024;
const MAX_SCAN_FILES = 5000;
const MAX_SCAN_DEPTH = 25;

// ─── API Patterns (detects usage in source code) ────────────────────────────
const API_PATTERNS = {
  stripe: [
    /require\(["']stripe["']\)/gi,
    /from\s+["']stripe["']/gi,
    /import\s+Stripe\s+from\s+["']stripe["']/gi,
    /new\s+Stripe\(/gi,
    /stripe\.(charges|paymentIntents|subscriptions|customers|webhooks)/gi,
  ],
  shopify: [
    /require\(["']@shopify\/shopify-api["']\)/gi,
    /from\s+["']@shopify\/shopify-api["']/gi,
    /Shopify\.Session/gi,
    /shopify\.rest\./gi,
  ],
  twilio: [
    /require\(["']twilio["']\)/gi,
    /from\s+["']twilio["']/gi,
    /new\s+Twilio\(/gi,
    /twilio\.(messages|calls|verify)/gi,
  ],
  sendgrid: [
    /require\(["']@sendgrid\/mail["']\)/gi,
    /from\s+["']@sendgrid\/mail["']/gi,
    /sendgrid\.send\(/gi,
    /SG\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  ],
  github: [
    /@octokit\/rest/gi,
    /octokit\.repos\./gi,
    /api\.github\.com/gi,
    /github\.com\/repos\//gi,
  ],
};

const SCAN_EXTENSIONS = [
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".java", ".php",
  ".env", ".json", ".yaml", ".yml", ".toml",
];

const IGNORE_DIRS = [
  "node_modules", ".git", "dist", "build", "target",
  "__pycache__", ".venv", "venv", ".next", ".nuxt",
  "vendor", "coverage", ".cache",
];

// ─── Helpers ────────────────────────────────────────────────────────────────
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(RC_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveConfig(config) {
  // The file contains a live API key. Create it owner-only (0600); Windows
  // ignores the mode, so also try an explicit chmod for POSIX systems.
  fs.writeFileSync(RC_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(RC_PATH, 0o600);
  } catch {
    // Best effort on platforms without POSIX permissions.
  }
}

function redactSnippet(line) {
  if (!line) return "";
  return line
    .replace(/\bSG\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g, "SG.[REDACTED]")
    .replace(/\b(sk_live_|sk_test_|rk_live_|whsec_|xox[baprs]-|gh[pousr]_|github_pat_|AKIA)[A-Za-z0-9_-]{6,}/g, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|secret|token|password|authorization)\s*[:=]\s*["']?)[^"'\s,;]{6,}/gi, "$1[REDACTED]");
}

function parseGitRemote(remote) {
  if (!remote) return null;
  let candidate = String(remote).trim();

  // scp-like syntax: git@github.com:owner/repo.git
  const scp = candidate.match(/^[^@\s]+@[^:\s]+:(.+)$/);
  if (scp) candidate = scp[1];
  else {
    try {
      const parsed = new URL(candidate);
      candidate = parsed.pathname.replace(/^\/+/, "");
    } catch {
      return null;
    }
  }

  candidate = candidate.replace(/\.git$/i, "").replace(/\/+$/, "");
  const parts = candidate.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(parts[0]) || !/^[A-Za-z0-9_.-]+$/.test(parts[1])) {
    return null;
  }
  return `${parts[0]}/${parts[1]}`;
}

function readHidden(promptText) {
  if (!process.stdin.isTTY) {
    const readline = require("readline");
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(promptText, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  return new Promise((resolve) => {
    process.stdout.write(promptText);
    let value = "";
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const cleanup = () => {
      process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value.trim());
          return;
        }
        if (ch === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (ch >= " ") {
          value += ch;
          process.stdout.write("*");
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

function apiRequest(method, endpoint, body, token) {
  const url = new URL(endpoint, API_BASE);
  const isHttps = url.protocol === "https:";
  const lib = isHttps ? https : http;

  const headers = {};
  if (body !== undefined && body !== null) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      { method, headers },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (!data.trim()) {
            if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
            else resolve({});
            return;
          }
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 400) {
              const detail = Array.isArray(json.detail)
                ? json.detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
                : json.detail;
              reject(new Error(detail || `HTTP ${res.statusCode}`));
            } else {
              resolve(json);
            }
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          }
        });
      }
    );
    req.on("error", reject);
    if (body !== undefined && body !== null) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Local File Scanner ─────────────────────────────────────────────────────
function scanLocalDir(dirPath) {
  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved)) {
    console.error(`❌ Directory not found: ${resolved}`);
    process.exit(1);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    console.error(`❌ Not a directory: ${resolved}`);
    process.exit(1);
  }

  console.log(`\n🔍 Scanning: ${resolved}\n`);

  const detections = [];
  let fileCount = 0;

  function walkDir(dir, depth = 0) {
    if (depth > MAX_SCAN_DEPTH || fileCount >= MAX_SCAN_FILES) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (fileCount >= MAX_SCAN_FILES) return;
      const fullPath = path.join(dir, entry.name);

      // Never follow symlinks: they can escape the project directory, loop, or
      // expose unrelated files through a link committed to the repository.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.includes(entry.name)) {
          walkDir(fullPath, depth + 1);
        }
        continue;
      }
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!SCAN_EXTENSIONS.includes(ext)) continue;

      fileCount++;
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > MAX_SCAN_FILE_BYTES) continue;
        const content = fs.readFileSync(fullPath, "utf8");
        const relativePath = path.relative(resolved, fullPath).split(path.sep).join("/");

        for (const [api, patterns] of Object.entries(API_PATTERNS)) {
          for (const pattern of patterns) {
            pattern.lastIndex = 0;
            const matches = content.match(pattern);
            if (matches && matches.length > 0) {
              // Find line numbers
              const lines = content.split("\n");
              const lineNumbers = [];
              for (let i = 0; i < lines.length; i++) {
                pattern.lastIndex = 0;
                if (pattern.test(lines[i])) {
                  lineNumbers.push(i + 1);
                }
              }
              detections.push({
                api,
                file: relativePath,
                matches: matches.length,
                lines: lineNumbers.slice(0, 5),
                snippet: redactSnippet(
                  lines[lineNumbers[0] - 1]?.trim().slice(0, 120)
                ),
              });
            }
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  walkDir(resolved);

  // Deduplicate
  const seen = new Set();
  const unique = detections.filter((d) => {
    const key = `${d.api}:${d.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Stable provider display order (the CLI has no per-detection severity data).
  const severityOrder = { github: 0, stripe: 1, twilio: 2, shopify: 3, sendgrid: 4 };
  unique.sort((a, b) => (severityOrder[a.api] ?? 9) - (severityOrder[b.api] ?? 9));

  // Output
  console.log(`📁 Files scanned: ${fileCount}`);
  console.log(`🔗 API detections: ${unique.length}\n`);

  if (unique.length === 0) {
    console.log("✅ No third-party API usage detected.\n");
    return { fileCount, detections: unique, grouped: {} };
  }

  // Group by API
  const grouped = {};
  for (const d of unique) {
    if (!grouped[d.api]) grouped[d.api] = [];
    grouped[d.api].push(d);
  }

  for (const [api, items] of Object.entries(grouped)) {
    const icon = { stripe: "💳", shopify: "🛒", twilio: "📱", sendgrid: "📧", github: "🐙" }[api] || "🔗";
    console.log(`${icon} ${api.toUpperCase()} (${items.length} file${items.length !== 1 ? "s" : ""})`);
    for (const item of items) {
      console.log(`   📄 ${item.file}`);
      console.log(`      Lines: ${item.lines.join(", ")} | Matches: ${item.matches}`);
      if (item.snippet) console.log(`      ${item.snippet}`);
    }
    console.log();
  }

  // Summary
  console.log("─".repeat(50));
  console.log("Summary:");
  for (const [api, items] of Object.entries(grouped)) {
    console.log(`  ${api}: ${items.length} file(s)`);
  }
  console.log();

  return { fileCount, detections: unique, grouped };
}

// ─── Commands ───────────────────────────────────────────────────────────────
async function login() {
  console.log("\n🔑 Breaklytix Login\n");
  console.log("To get an API key:");
  console.log(`  1. Go to ${WEB_BASE}/dashboard/settings/api-keys`);
  console.log('  2. Click "Generate Key"\n');
  const key = await readHidden("Paste your API key (input hidden): ");

  if (!key.startsWith("afx_live_")) {
    console.error("❌ Invalid key format. Key must start with afx_live_");
    process.exit(1);
  }

  // Validate before persisting so a typo does not leave a broken session on disk.
  try {
    await apiRequest("GET", "/api/public/v1/alerts?per_page=1", undefined, key);
  } catch (e) {
    console.error(`❌ The API rejected this key: ${e.message}`);
    process.exit(1);
  }

  saveConfig({ api_key: key });
  console.log("✅ Key validated and saved to " + RC_PATH);
  console.log("   Run `breaklytix status` to get started.\n");
}

async function scan() {
  const config = loadConfig();
  const args = process.argv.slice(3);

  // Check for --dir flag
  const dirIndex = args.indexOf("--dir");
  if (dirIndex !== -1) {
    const dirPath = args[dirIndex + 1];
    if (!dirPath) {
      console.error("❌ --dir requires a path. Example: breaklytix scan --dir .");
      process.exit(1);
    }
    scanLocalDir(dirPath);
    console.log("ℹ️  This was a local-only scan; no files or results were uploaded.");
    console.log("   Connect a GitHub repository in the dashboard for server-side monitoring.\n");
    return;
  }

  // Original git-based scan
  if (!config?.api_key) {
    console.error("❌ Not logged in. Run `breaklytix login` first.");
    process.exit(1);
  }

  console.log("\n🔍 Scanning current directory...\n");

  let repoName;
  try {
    const remote = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
    repoName = parseGitRemote(remote);
    if (!repoName) throw new Error("unsupported remote URL");
  } catch {
    console.error("❌ Not a git repository or the origin remote is not a GitHub owner/repo URL.");
    console.log("   Use `breaklytix scan --dir ./path` to scan a local directory.\n");
    process.exit(1);
  }

  console.log(`   Repository: ${repoName}`);

  let repos;
  try {
    repos = await apiRequest("GET", "/api/public/v1/repos", undefined, config.api_key);
  } catch (e) {
    console.error(`❌ Could not load connected repositories: ${e.message}`);
    process.exit(1);
  }

  const repo = Array.isArray(repos) ? repos.find((r) => r.full_name === repoName) : null;
  if (!repo) {
    console.log(`   ⚠️  Repo "${repoName}" is not connected to Breaklytix.`);
    console.log(`   Connect it first at ${WEB_BASE}/dashboard/repos\n`);
    process.exit(1);
  }

  console.log(`   Repo ID: ${repo.id}`);
  console.log("   Triggering scan...");
  try {
    const result = await apiRequest("POST", `/api/public/v1/repos/${encodeURIComponent(repo.id)}/scan`, undefined, config.api_key);
    console.log(
      `   ✅ Scan complete: ${result.files_scanned ?? 0} files, ` +
      `${result.detections_found ?? 0} detections, ` +
      `${result.new_apis_detected ?? 0} new API(s)\n`
    );
    if (result.plan_warning) console.log(`   ⚠️  ${result.plan_warning}\n`);
  } catch (e) {
    console.error(`❌ Scan failed: ${e.message}\n`);
    process.exit(1);
  }
}

async function watch() {
  console.log("\n👁️  Breaklytix local watch mode");
  console.log("   Re-scanning this directory every 30 seconds. Press Ctrl+C to stop.\n");

  let lastScan = null;

  function runScan() {
    const result = scanLocalDir(process.cwd());
    if (result && JSON.stringify(result) !== JSON.stringify(lastScan)) {
      if (lastScan) {
        console.log("🔔 Changes detected!\n");
      }
      lastScan = result;
    }
  }

  runScan();
  setInterval(runScan, 30000); // Scan every 30 seconds
}

async function status() {
  const config = loadConfig();
  if (!config?.api_key) {
    console.error("❌ Not logged in. Run `breaklytix login` first.");
    process.exit(1);
  }

  console.log("\n📊 Breaklytix Status\n");

  try {
    const [alertsRes, fixesRes] = await Promise.all([
      apiRequest("GET", "/api/public/v1/alerts?per_page=50", null, config.api_key),
      apiRequest("GET", "/api/public/v1/fixes?per_page=50", null, config.api_key),
    ]);

    const alerts = alertsRes.alerts || [];
    if (alerts.length === 0) {
      console.log("ℹ️  No alerts returned for this account (this does not by itself prove every API is stable).\n");
    } else {
      console.log(`⚠️  ${alerts.length} alert${alerts.length !== 1 ? "s" : ""}:\n`);
      console.log(
        "  " +
          "Severity".padEnd(10) +
          "API".padEnd(25) +
          "Change".padEnd(20) +
          "Repo"
      );
      console.log("  " + "─".repeat(75));
      for (const a of alerts.slice(0, 20)) {
        const sev = (a.severity || "—").padEnd(10);
        const api = (a.provider || a.api_name || "—").padEnd(25);
        const change = (a.change_type || "—").padEnd(20);
        const repo = a.repo_id ? a.repo_id.slice(0, 8) + "…" : "—";
        console.log(`  ${sev}${api}${change}${repo}`);
      }
      if (alerts.length > 20) console.log(`  ... and ${alerts.length - 20} more`);
      console.log();
    }

    const fixes = fixesRes.fixes || [];
    const pending = fixes.filter((f) => f.status === "needs_review");
    if (pending.length > 0) {
      console.log(`🔧 ${pending.length} pending fix${pending.length !== 1 ? "es" : ""}:\n`);
      console.log(
        "  " +
          "Status".padEnd(15) +
          "Description".padEnd(40) +
          "Repo"
      );
      console.log("  " + "─".repeat(60));
      for (const f of pending.slice(0, 10)) {
        const st = (f.status || "—").padEnd(15);
        const desc = (f.description || "—").slice(0, 38).padEnd(40);
        const repo = f.repo_id ? f.repo_id.slice(0, 8) + "…" : "—";
        console.log(`  ${st}${desc}${repo}`);
      }
      console.log();
    }
  } catch (e) {
    console.error(`❌ API error: ${e.message}`);
    console.error("   Make sure your API key is valid and the server is running.\n");
    process.exit(1);
  }
}

// ─── CLI Router ─────────────────────────────────────────────────────────────
const cmd = process.argv[2];

switch (cmd) {
  case "login":
    login();
    break;
  case "scan":
    scan();
    break;
  case "watch":
    watch();
    break;
  case "status":
    status();
    break;
  default:
    console.log(`
🔧 breaklytix — Breaklytix API CLI

Usage:
  breaklytix login              Validate and save your API key
  breaklytix scan               Scan the connected git repository via the API
  breaklytix scan --dir <path>  Scan a local directory (no upload)
  breaklytix status             Show alerts and pending fixes
  breaklytix watch              Re-scan the current directory every 30s

Examples:
  breaklytix scan --dir ./src           Scan a source folder
  breaklytix scan --dir C:\\Projects\\app  Scan a Windows directory
  breaklytix scan --dir /home/user/app  Scan a Linux directory

Configuration:
  API URL: ${API_BASE}
  Web URL: ${WEB_BASE}
  Config:  ${RC_PATH} (owner-only permissions where supported)

Environment overrides:
  AUTOFIX_API_URL   API origin
  AUTOFIX_WEB_URL   Dashboard origin used in printed links
`);
}
