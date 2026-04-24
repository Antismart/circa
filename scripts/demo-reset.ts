import { spawn } from "node:child_process";
import { optionalEnv, requireEnv } from "../lib/hedera";
import { prisma } from "../lib/db";

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

  console.log("── circa · demo reset ──");
  console.log("Wiping the Prisma tables only. HTS collection, HCS topic,");
  console.log("marketplace contract, and demo accounts persist across resets.\n");

  requireEnv("DATABASE_URL");

  const [deletedEvents, deletedListings, deletedPassports] =
    await prisma.$transaction([
      prisma.event.deleteMany(),
      prisma.listing.deleteMany(),
      prisma.passport.deleteMany(),
    ]);
  console.log(
    `Cleared: ${deletedEvents.count} events, ${deletedListings.count} listings, ${deletedPassports.count} passports`
  );

  await prisma.$disconnect();

  console.log("\nRe-seeding 3 demo passports on testnet...");
  await runCmd("pnpm", ["seed"]);

  console.log("\n── Reset complete ──");
}

main().catch(async (err) => {
  console.error("\nReset failed:");
  console.error(err);
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
