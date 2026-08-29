#!/usr/bin/env node
/**
 * create-spacefield — set up a Spacefield workspace in one command.
 *
 *   npx create-spacefield my-workspace
 *
 * Downloads the latest source tarball from GitHub (no git required, and no
 * history to clone), writes a .env.local from the documented example, and
 * installs dependencies with whichever package manager invoked it.
 *
 * Node built-ins only — nothing to audit, nothing to install first.
 */

import { execSync, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, rm, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import process from "node:process";
import readline from "node:readline/promises";

const REPO = "asadev/spacefield";
const TARBALL = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/main`;
const DOCS = "https://spacefield.co";

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

function die(msg) {
  console.error(`\n${c.red("✗")} ${msg}\n`);
  process.exit(1);
}

/** Which package manager launched us? Falls back to npm. */
function packageManager() {
  const ua = process.env.npm_config_user_agent || "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  return "npm";
}

/** A directory name npm and the filesystem will both accept. */
function validName(name) {
  if (!name || name === "." || name === "..") return false;
  if (name.startsWith("-")) return false;
  return /^[A-Za-z0-9._-]+$/.test(name);
}

async function isEmpty(dir) {
  if (!existsSync(dir)) return true;
  const entries = await readdir(dir);
  return entries.filter((e) => e !== ".git" && e !== ".DS_Store").length === 0;
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  if (args.includes("-h") || args.includes("--help")) {
    console.log(`
${c.bold("create-spacefield")} — a desktop OS that runs in a browser tab

  ${c.cyan("npx create-spacefield")} ${c.dim("[directory]")}

Options
  -h, --help     show this
  -v, --version  print the version

Docs: ${DOCS}
`);
    return;
  }
  if (args.includes("-v") || args.includes("--version")) {
    const pkg = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8")
    );
    console.log(pkg.version);
    return;
  }

  let target = args[0];
  if (!target) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    target = (await rl.question(`${c.bold("Directory name")} ${c.dim("(spacefield)")}: `)).trim() || "spacefield";
    rl.close();
  }
  if (!validName(basename(target))) die(`"${target}" is not a usable directory name.`);

  const dir = resolve(process.cwd(), target);
  if (!(await isEmpty(dir))) die(`${dir} already exists and is not empty.`);

  const pm = packageManager();
  console.log(`\n${c.bold("Spacefield")} ${c.dim("— open-source desktop OS")}\n`);
  console.log(`  ${c.dim("into")}  ${dir}`);
  console.log(`  ${c.dim("using")} ${pm}\n`);

  // 1. fetch the source
  process.stdout.write(`${c.dim("→")} downloading source… `);
  const tmp = join(tmpdir(), `spacefield-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  const tgz = join(tmp, "source.tar.gz");
  try {
    await download(TARBALL, tgz);
  } catch (e) {
    die(`could not download the source (${e.message}).\nCheck your connection, or clone it yourself:\n  git clone https://github.com/${REPO}.git`);
  }
  console.log(c.green("done"));

  // 2. unpack, stripping the repo's top-level folder
  process.stdout.write(`${c.dim("→")} unpacking… `);
  await mkdir(dir, { recursive: true });
  const untar = spawnSync("tar", ["-xzf", tgz, "-C", dir, "--strip-components=1"], { stdio: "ignore" });
  if (untar.status !== 0) die("could not unpack the archive — is `tar` available on this system?");
  await rm(tmp, { recursive: true, force: true });
  console.log(c.green("done"));

  // 3. seed .env.local from the documented example
  const example = join(dir, ".env.example");
  const envLocal = join(dir, ".env.local");
  if (existsSync(example) && !existsSync(envLocal)) {
    await writeFile(envLocal, await readFile(example, "utf8"));
    console.log(`${c.dim("→")} wrote .env.local ${c.green("done")}`);
  }

  // 4. install
  console.log(`${c.dim("→")} installing dependencies ${c.dim("(this one takes a while)")}\n`);
  const install = spawnSync(pm, ["install"], { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
  if (install.status !== 0) {
    console.log(`\n${c.red("✗")} install failed. Try it by hand:\n    cd ${target} && ${pm} install\n`);
  }

  const run = pm === "npm" ? "npm run dev" : `${pm} dev`;
  console.log(`
${c.green("✓")} ${c.bold("Ready.")}

${c.bold("One thing left")} — Spacefield stores your data in Supabase.
Create a free project at ${c.cyan("https://supabase.com")}, then put these three
values into ${c.bold(".env.local")} (Project Settings → API):

    NEXT_PUBLIC_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY
    SUPABASE_SERVICE_ROLE_KEY

Apply the database schema, then start it:

    ${c.cyan(`cd ${target}`)}
    ${c.cyan("npx supabase link --project-ref <your-project-ref>")}
    ${c.cyan("npx supabase db push")}
    ${c.cyan(run)}

Everything else in .env.local is optional — leave a key blank and the
feature it powers simply stays switched off.

Docs ${DOCS}  ·  Source https://github.com/${REPO}
`);
}

main().catch((e) => die(e?.message || String(e)));
