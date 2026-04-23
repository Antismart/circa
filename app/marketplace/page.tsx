import Link from "next/link";
import { prisma } from "@/lib/db";
import { loadPassport } from "@/lib/passport";
import { SectionHeading } from "../_components/SectionHeading";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const rows = await prisma.passport.findMany({ orderBy: { createdAt: "asc" } });
  const items = rows
    .map((r) => {
      const p = loadPassport(r.tokenId, r.serialNumber);
      if (!p) return null;
      const seed = Number(r.serialNumber) % 5;
      const prices = [120, 450, 89, 240, 60];
      const priceEur = prices[seed];
      return {
        tokenId: r.tokenId,
        serial: r.serialNumber,
        name: p.name,
        manufacturer: p.manufacturer.name,
        category: p.category,
        priceEur,
        royaltyEur: Math.round(priceEur * 0.025 * 100) / 100,
        owner: r.ownerAccountId,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="rise">
      <div className="mb-12 max-w-2xl">
        <div className="label mb-3">§ IV · Resale</div>
        <h1
          className="font-display text-[54px] md:text-[74px] leading-[0.95] tracking-[-0.025em] mb-5"
          style={{ fontWeight: 500 }}
        >
          A{" "}
          <em className="italic" style={{ fontWeight: 500 }}>
            second
          </em>{" "}
          life, earning a royalty.
        </h1>
        <p className="text-[14px] leading-[1.65] text-ink-soft">
          Each resale transfers the NFT and automatically pays a 2.5% royalty to
          the original manufacturer. Hedera enforces the fee at the consensus layer
          — no marketplace can opt out. The manufacturer now has a reason to want
          your product to last.
        </p>
      </div>

      <div className="mb-10 p-4 border-l-2 border-ink-faint bg-paper-dim/50 max-w-3xl">
        <div className="label mb-1">Preview · contract pending deployment</div>
        <div className="text-[13px] text-ink-soft">
          Buying and listing go live once the CircularMarketplace contract is
          deployed (Track 2). The royalty mechanism on the HTS collection is
          already active and visible on HashScan.
        </div>
      </div>

      <section>
        <SectionHeading
          number="§ I"
          title="Listings"
          subtitle={`${items.length} specimens for resale`}
        />
        <div className="divide-y divide-rule border-t border-b border-rule-strong">
          {items.map((item) => (
            <article
              key={`${item.tokenId}-${item.serial}`}
              className="grid grid-cols-[1fr_auto] md:grid-cols-[80px_1fr_auto_auto] items-center gap-5 py-6"
            >
              <div className="hidden md:block font-mono text-[11px] text-ink-faint numeral">
                N° {String(item.serial).padStart(3, "0")}
              </div>
              <div>
                <div className="label mb-1">{item.category}</div>
                <h3
                  className="font-display text-[26px] leading-[1.02] text-ink"
                  style={{ fontWeight: 500 }}
                >
                  {item.name}
                </h3>
                <div className="mt-1 text-[12px] text-ink-soft">
                  <span className="italic">by</span> {item.manufacturer} ·{" "}
                  <Link
                    href={`/p/${item.tokenId}-${item.serial}`}
                    className="underline decoration-rule-strong underline-offset-4 hover:decoration-accent hover:text-accent"
                  >
                    inspect passport
                  </Link>
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-[28px] text-ink numeral leading-none">
                  €{item.priceEur}
                </div>
                <div className="font-mono text-[10px] text-accent mt-1">
                  royalty €{item.royaltyEur.toFixed(2)}
                </div>
              </div>
              <button
                type="button"
                disabled
                className="btn-ghost opacity-60 cursor-not-allowed"
                title="Awaiting marketplace contract deployment"
              >
                Buy
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
