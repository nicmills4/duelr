#!/usr/bin/env node
/**
 * Duelr Test Runner
 * ─────────────────
 * 1. Starts the Next.js server if not already running on port 3000
 * 2. Runs every suite in tests/suites/ in filename order
 * 3. Writes a human-readable summary to test-results.txt
 *
 * Usage:
 *   node tests/runner.mjs
 *
 * Optional env vars:
 *   TEST_URL            Override base URL (default: http://localhost:3000)
 *   ADMIN_PASSWORD      Enables admin suite tests
 *   TEST_RIOT_ID        Enables tests needing a guest session  (e.g. Faker#KR1)
 *   TEST_RIOT_REGION    Region for TEST_RIOT_ID                (default: na1)
 *   TEST_EMAIL          Enables tests needing a full account
 *   TEST_PASSWORD       Password for TEST_EMAIL account
 */

import { spawn }       from "child_process";
import { readdir }     from "fs/promises";
import { writeFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

import { HttpClient, BASE_URL } from "./helpers/http.mjs";

const __dirname  = fileURLToPath(new URL(".", import.meta.url));
const SUITES_DIR = join(__dirname, "suites");
const RESULTS_FILE = resolve(__dirname, "..", "test-results.txt");

// ─── Colour helpers ────────────────────────────────────────────────────────────

const c = {
  reset:  "\x1b[0m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  gray:   "\x1b[90m",
  bold:   "\x1b[1m",
  cyan:   "\x1b[36m",
};

const green  = s => `${c.green}${s}${c.reset}`;
const red    = s => `${c.red}${s}${c.reset}`;
const yellow = s => `${c.yellow}${s}${c.reset}`;
const gray   = s => `${c.gray}${s}${c.reset}`;
const bold   = s => `${c.bold}${s}${c.reset}`;
const cyan   = s => `${c.cyan}${s}${c.reset}`;

// ─── Server management ────────────────────────────────────────────────────────

async function isServerUp() {
  try {
    const res = await fetch(`${BASE_URL}/api/leaderboard`, { signal: AbortSignal.timeout(2000) });
    return res.status < 600;
  } catch {
    return false;
  }
}

async function waitForServer(maxSeconds = 60) {
  const start = Date.now();
  while (Date.now() - start < maxSeconds * 1000) {
    if (await isServerUp()) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function startServer() {
  console.log(gray("  Starting Next.js dev server…"));
  const proc = spawn("npm", ["run", "dev"], {
    cwd:   resolve(__dirname, ".."),
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  // Print server output with indent
  proc.stdout.on("data", d => {
    for (const line of d.toString().split("\n").filter(Boolean))
      process.stdout.write(gray(`  [server] ${line}\n`));
  });
  proc.stderr.on("data", d => {
    for (const line of d.toString().split("\n").filter(Boolean))
      process.stdout.write(gray(`  [server] ${line}\n`));
  });

  const ready = await waitForServer(60);
  if (!ready) {
    proc.kill();
    throw new Error("Server failed to start within 60 seconds");
  }
  return proc;
}

// ─── Result types ─────────────────────────────────────────────────────────────

// { status: "pass"|"fail"|"skip", name, error?, skipReason? }

// ─── Test runner ──────────────────────────────────────────────────────────────

async function runSuite(suite) {
  const results = [];

  for (const test of suite.tests) {
    if (test.skip) {
      results.push({ status: "skip", name: test.name, skipReason: test.skipReason ?? "Skipped" });
      continue;
    }

    const http = new HttpClient(); // fresh cookie jar per test
    const start = Date.now();
    try {
      await test.run(http);
      results.push({ status: "pass", name: test.name, ms: Date.now() - start });
    } catch (err) {
      results.push({ status: "fail", name: test.name, error: err.message, ms: Date.now() - start });
    }
  }

  return results;
}

// ─── Summary writer ────────────────────────────────────────────────────────────

function buildSummary(allResults, durationMs) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);

  let pass = 0, fail = 0, skip = 0;
  for (const { results } of allResults)
    for (const r of results) {
      if (r.status === "pass") pass++;
      else if (r.status === "fail") fail++;
      else skip++;
    }
  const total = pass + fail + skip;

  const bar = "═".repeat(54);
  const line = "─".repeat(54);

  const lines = [
    `╔${bar}╗`,
    `║${"  DUELR TEST SUITE RESULTS".padEnd(54)}║`,
    `║${"  " + ts}${"".padEnd(54 - 2 - ts.length)}║`,
    `╚${bar}╝`,
    "",
    `OVERALL  ${pass} passed · ${fail} failed · ${skip} skipped · ${total} total`,
    `Duration ${(durationMs / 1000).toFixed(1)}s`,
    "",
  ];

  for (const { suite, results } of allResults) {
    const p = results.filter(r => r.status === "pass").length;
    const f = results.filter(r => r.status === "fail").length;
    const s = results.filter(r => r.status === "skip").length;
    lines.push(line);
    lines.push(` ${suite.name.toUpperCase()}  (${p}✓ ${f > 0 ? f + "✗ " : ""}${s > 0 ? s + "⏭" : ""})`);
    lines.push(line);
    for (const r of results) {
      if (r.status === "pass")
        lines.push(`  ✅ [PASS] ${r.name}${r.ms != null ? "  ("+r.ms+"ms)" : ""}`);
      else if (r.status === "fail")
        lines.push(`  ❌ [FAIL] ${r.name}\n         → ${r.error}`);
      else
        lines.push(`  ⏭  [SKIP] ${r.name}  — ${r.skipReason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + bold(cyan("  ██████  DUELR TEST SUITE  ██████")) + "\n");

  // 1. Ensure server is running
  let serverProc = null;
  const alreadyUp = await isServerUp();

  if (alreadyUp) {
    console.log(green("  ✓") + gray(` Server already running at ${BASE_URL}`));
  } else {
    try {
      serverProc = await startServer();
      console.log(green("  ✓") + " Server started successfully");
    } catch (err) {
      console.error(red("  ✗ " + err.message));
      process.exit(1);
    }
  }

  console.log();

  // 2. Load suites in filename order
  const files = (await readdir(SUITES_DIR))
    .filter(f => f.endsWith(".mjs"))
    .sort();

  const suiteModules = [];
  for (const f of files) {
    const mod = await import(join(SUITES_DIR, f));
    suiteModules.push(mod.suite);
  }

  // 3. Run suites
  const allResults = [];
  const globalStart = Date.now();

  for (const suite of suiteModules) {
    process.stdout.write(bold(`  ${suite.name} `));
    const results = await runSuite(suite);

    const p = results.filter(r => r.status === "pass").length;
    const f = results.filter(r => r.status === "fail").length;
    const s = results.filter(r => r.status === "skip").length;

    const badge = f > 0 ? red(`${f} failed`) : green(`all passed`);
    console.log(gray(`(${results.length} tests — `) + badge + gray(`${s ? ", " + s + " skipped" : ""})`));

    for (const r of results) {
      if (r.status === "pass")
        console.log(`    ${green("✓")} ${gray(r.name)}`);
      else if (r.status === "fail")
        console.log(`    ${red("✗")} ${r.name}\n      ${red("→")} ${gray(r.error)}`);
      else
        console.log(`    ${yellow("⏭")} ${gray(r.name + " [skipped]")}`);
    }
    console.log();

    allResults.push({ suite, results });
  }

  const durationMs = Date.now() - globalStart;

  // 4. Totals
  let totalPass = 0, totalFail = 0, totalSkip = 0;
  for (const { results } of allResults)
    for (const r of results) {
      if (r.status === "pass") totalPass++;
      else if (r.status === "fail") totalFail++;
      else totalSkip++;
    }

  const total = totalPass + totalFail + totalSkip;
  const summaryLine = totalFail === 0
    ? green(`  ✅ All ${totalPass} tests passed`)
    : red(`  ❌ ${totalFail} of ${total} tests FAILED`);

  console.log("─".repeat(54));
  console.log(summaryLine);
  console.log(gray(`  ${totalSkip} skipped · ${(durationMs / 1000).toFixed(1)}s total`));

  // 5. Write summary file
  const summary = buildSummary(allResults, durationMs);
  writeFileSync(RESULTS_FILE, summary, "utf8");
  console.log(gray(`\n  Summary written to: test-results.txt\n`));

  // 6. Tear down server if we started it
  if (serverProc) {
    serverProc.kill();
    // On Windows, kill child processes too
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", serverProc.pid, "/f", "/t"], { shell: true });
    }
  }

  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(red("Fatal: " + err.message));
  process.exit(1);
});
