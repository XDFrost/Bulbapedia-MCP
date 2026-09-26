// Local Postgres for development and tests, using the binaries bundled by embedded-postgres.
// The server is started with pg_ctl so it keeps running after this script exits.
// Usage: node scripts/local-db.mjs start|stop|migrate|status
import { readFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

const ROOT = process.cwd();
const DATA_DIR = join(ROOT, ".local-db");
const PORT = 54329;
const USER = "postgres";
const PASSWORD = "postgres";
const DATABASE = "bulbapedia";
export const CONNECTION_STRING = `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`;

async function binDir() {
	const base = join(ROOT, "node_modules", "@embedded-postgres");
	for (const pkg of await readdir(base)) {
		const dir = join(base, pkg, "native", "bin");
		if (existsSync(join(dir, "pg_ctl"))) return dir;
	}
	throw new Error("embedded-postgres binaries not found; run npm install");
}

function run(bin, args, opts = {}) {
	return execFileSync(bin, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts });
}

async function isUp() {
	const sql = postgres(`postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/postgres`, { max: 1, connect_timeout: 2 });
	try {
		await sql`select 1`;
		return true;
	} catch {
		return false;
	} finally {
		await sql.end({ timeout: 1 }).catch(() => {});
	}
}

async function start() {
	if (await isUp()) {
		console.log(`local db already running on ${PORT}`);
		await migrate();
		return;
	}
	const bin = await binDir();
	if (!existsSync(join(DATA_DIR, "PG_VERSION"))) {
		// initdb requires an empty (or absent) data directory, so the password file lives next to it.
		await mkdir(join(ROOT, "node_modules", ".tmp"), { recursive: true });
		const pwfile = join(ROOT, "node_modules", ".tmp", "local-db-pw");
		await writeFile(pwfile, PASSWORD);
		run(join(bin, "initdb"), ["-D", DATA_DIR, "-U", USER, "--pwfile", pwfile, "-A", "password", "-E", "UTF8"]);
	}
	run(join(bin, "pg_ctl"), ["-D", DATA_DIR, "-l", join(DATA_DIR, "server.log"), "-o", `-p ${PORT} -c listen_addresses=127.0.0.1`, "-w", "start"]);
	const admin = postgres(`postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/postgres`, { max: 1 });
	const exists = await admin`select 1 from pg_database where datname = ${DATABASE}`;
	if (!exists.length) await admin.unsafe(`create database ${DATABASE}`);
	await admin.end();
	await migrate();
	console.log(`local db started on ${PORT}`);
}

async function stop() {
	if (!(await isUp())) {
		console.log("local db not running");
		return;
	}
	run(join(await binDir(), "pg_ctl"), ["-D", DATA_DIR, "-m", "fast", "-w", "stop"]);
	console.log("local db stopped");
}

async function migrate() {
	const sql = postgres(CONNECTION_STRING, { max: 1 });
	const dir = join(ROOT, "db", "migrations");
	for (const f of (await readdir(dir)).filter((x) => x.endsWith(".sql")).sort()) {
		await sql.unsafe(await readFile(join(dir, f), "utf8"));
		console.log(`applied ${f}`);
	}
	await sql.end();
}

const cmd = process.argv[2];
if (cmd === "start") await start();
else if (cmd === "stop") await stop();
else if (cmd === "migrate") await migrate();
else if (cmd === "status") console.log((await isUp()) ? `running on ${PORT}` : "stopped");
else {
	console.log("usage: node scripts/local-db.mjs start|stop|migrate|status");
	process.exit(1);
}
