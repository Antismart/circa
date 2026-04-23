import { RepairForm, type PassportOption } from "./RepairForm";
import { getRoleFromCookie } from "@/lib/role";
import { prisma } from "@/lib/db";
import { loadPassport } from "@/lib/passport";

export const dynamic = "force-dynamic";

async function listPassportOptions(): Promise<PassportOption[]> {
  const rows = await prisma.passport.findMany({
    orderBy: { createdAt: "asc" },
  });
  const options: PassportOption[] = [];
  for (const row of rows) {
    const passport = loadPassport(row.tokenId, row.serialNumber);
    if (!passport) continue;
    options.push({
      value: `${row.tokenId}-${row.serialNumber}`,
      label: passport.name,
      serial: String(row.serialNumber).padStart(3, "0"),
      manufacturer: passport.manufacturer.name,
    });
  }
  return options;
}

export default async function RepairPage() {
  const [role, passports] = await Promise.all([
    getRoleFromCookie(),
    listPassportOptions(),
  ]);

  return (
    <div className="rise">
      <div className="mb-12 max-w-2xl">
        <div className="label mb-3">§ III · Repair</div>
        <h1
          className="font-display text-[54px] md:text-[74px] leading-[0.95] tracking-[-0.025em] mb-5"
          style={{ fontWeight: 500 }}
        >
          Extend the{" "}
          <em className="italic" style={{ fontWeight: 500 }}>
            life
          </em>{" "}
          of a thing.
        </h1>
        <p className="text-[14px] leading-[1.65] text-ink-soft">
          Log a repair you performed on behalf of a registered object. The event is
          signed by your repairer account and written to the Hedera consensus
          service, visible to every future scanner of this product&apos;s passport.
        </p>
      </div>

      {role !== "repairer" && (
        <div className="mb-10 p-5 border-l-2 border-stamp bg-stamp/5 max-w-2xl">
          <div className="label text-stamp mb-1">Role mismatch</div>
          <div className="text-[13px] text-ink">
            You are signing as <b>{role}</b>. Switch the dropdown in the masthead to{" "}
            <b>Repairer</b> before submitting — the API will otherwise reject the
            request as unauthorised.
          </div>
        </div>
      )}

      <RepairForm passports={passports} />
    </div>
  );
}
