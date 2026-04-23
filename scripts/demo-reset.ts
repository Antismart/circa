import { spawn } from "node:child_process";
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { optionalEnv } from "../lib/hedera";

const PASSPORTS_DIR = join(process.cwd(), "data", "passports");
const DB_PATH = join(process.cwd(), "prisma", "dev.db");
const DB_JOURNAL = `${DB_PATH}-journal`;

function runCmd(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", env: process.env });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
    child.on("error", reject);
  });
}

async function main(): Promise<void> {
  const network = optionalEnv("HEDERA_NETWORK") ?? "testnet";
  if (network !== "testnet") {
    console.error(
      `Refusing to run demo:reset with HEDERA_NETWORK=${network}. ` +
        "This command is testnet-only."
    );
    process.exit(1);
  }

  console.log("── Circular DPP demo reset ──");
  console.log("Wiping local cache only. HTS collection, HCS topic, and demo accounts persist.\n");

  let dbCleared = 0;
  for (const p of [DB_PATH, DB_JOURNAL]) {
    if (existsSync(p)) {
      unlinkSync(p);
      dbCleared += 1;
    }
  }
  console.log(`SQLite: cleared ${dbCleared} file(s)`);

  let passportsCleared = 0;
  if (existsSync(PASSPORTS_DIR)) {
    for (const name of readdirSync(PASSPORTS_DIR)) {
      if (name.endsWith(".json")) {
        unlinkSync(join(PASSPORTS_DIR, name));
        passportsCleared += 1;
      }
    }
  }
  console.log(`Passport JSON: cleared ${passportsCleared} file(s)`);

  console.log("\nRe-pushing Prisma schema...");
  await runCmd("pnpm", ["exec", "prisma", "db", "push", "--skip-generate"]);

  console.log("\nRe-seeding 3 demo passports on testnet...");
  await runCmd("pnpm", ["seed"]);

  console.log("\n── Reset complete ──");
}

main().catch((err) => {
  console.error("\nReset failed:");
  console.error(err);
  process.exit(1);
});
