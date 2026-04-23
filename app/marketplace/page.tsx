import Link from "next/link";
import { prisma } from "@/lib/db";
import { loadPassport } from "@/lib/passport";
import { getRoleFromCookie, roleAccountId } from "@/lib/role";
import { SectionHeading } from "../_components/SectionHeading";
import { BuyButton, CancelButton, ListForm } from "./MarketplaceActions";

export const dynamic = "force-dynamic";

interface ActiveListing {
  marketplaceListingId: string;
  tokenId: string;
  serial: number;
  name: string;
  manufacturer: string;
  category: string;
  sellerAccountId: string;
  priceHbar: number;
  royaltyHbar: number;
}

interface OwnedItem {
  tokenId: string;
  serial: number;
  name: string;
  category: string;
}

interface SoldRecord {
  tokenId: string;
  serial: number;
  name: string;
  priceHbar: number;
  royaltyHbar: number;
  buyerAccountId: string;
  consensusTimestamp: string;
}

async function fetchData(currentAccountId: string) {
  const [active, sold, ownedRows] = await Promise.all([
    prisma.listing.findMany({
      where: { status: "active" },
      include: { passport: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.listing.findMany({
      where: { status: "sold" },
      include: {
        passport: { include: { events: { where: { type: "resale" } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.passport.findMany({
      where: {
        ownerAccountId: currentAccountId,
        listings: { none: { status: "active" } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const activeListings: ActiveListing[] = [];
  for (const l of active) {
    const p = loadPassport(l.passport.tokenId, l.passport.serialNumber);
    if (!p) continue;
    const priceHbar = Number(l.priceTinybars) / 1e8;
    activeListings.push({
      marketplaceListingId: l.marketplaceListingId,
      tokenId: l.passport.tokenId,
      serial: l.passport.serialNumber,
      name: p.name,
      manufacturer: p.manufacturer.name,
      category: p.category,
      sellerAccountId: l.sellerAccountId,
      priceHbar,
      royaltyHbar: Math.round(priceHbar * 0.025 * 1000) / 1000,
    });
  }

  const soldRecords: SoldRecord[] = [];
  for (const l of sold) {
    const p = loadPassport(l.passport.tokenId, l.passport.serialNumber);
    if (!p) continue;
    const priceHbar = Number(l.priceTinybars) / 1e8;
    const resaleEvent = l.passport.events[0];
    soldRecords.push({
      tokenId: l.passport.tokenId,
      serial: l.passport.serialNumber,
      name: p.name,
      priceHbar,
      royaltyHbar: Math.round(priceHbar * 0.025 * 1000) / 1000,
      buyerAccountId: l.passport.ownerAccountId,
      consensusTimestamp: resaleEvent?.hcsConsensusTimestamp ?? "",
    });
  }

  const owned: OwnedItem[] = [];
  for (const r of ownedRows) {
    const p = loadPassport(r.tokenId, r.serialNumber);
    if (!p) continue;
    owned.push({
      tokenId: r.tokenId,
      serial: r.serialNumber,
      name: p.name,
      category: p.category,
    });
  }

  return { activeListings, soldRecords, owned };
}

function fmtConsensus(ts: string): string {
  if (!ts) return "";
  const secs = Number(ts.split(".")[0]);
  if (!Number.isFinite(secs)) return ts;
  return new Date(secs * 1000).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortAccount(id: string): string {
  const parts = id.split(".");
  return parts.length === 3 ? `${parts[0]}.${parts[1]}.${parts[2]}` : id;
}

export default async function MarketplacePage() {
  const role = await getRoleFromCookie();
  const currentAccountId = roleAccountId(role);
  const { activeListings, soldRecords, owned } = await fetchData(currentAccountId);

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
          the original manufacturer. Hedera enforces the fee at the consensus
          layer — no marketplace can opt out. The manufacturer now has a reason
          to want your product to last.
        </p>
      </div>

      <section className="mb-16">
        <SectionHeading
          number="§ I"
          title="Active listings"
          subtitle={`${activeListings.length} item${activeListings.length === 1 ? "" : "s"} for sale`}
        />
        {activeListings.length === 0 ? (
          <div className="border-t border-b border-rule-strong py-16 text-center">
            <p className="font-display italic text-[22px] text-ink-soft mb-1">
              Nothing listed for resale.
            </p>
            <p className="text-[12px] text-ink-faint">
              Switch to Manufacturer in the masthead to list one of your items below.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-rule border-t border-b border-rule-strong">
            {activeListings.map((item) => {
              const isSeller = item.sellerAccountId === currentAccountId;
              return (
                <article
                  key={item.marketplaceListingId}
                  className="grid grid-cols-[1fr_auto] md:grid-cols-[80px_1fr_auto_auto] items-center gap-5 py-6"
                >
                  <div className="hidden md:block font-mono text-[11px] text-ink-faint numeral">
                    #{String(item.marketplaceListingId).padStart(3, "0")}
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
                      {isSeller && (
                        <span className="ml-2 label text-accent">your listing</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-[28px] text-ink numeral leading-none">
                      {item.priceHbar}
                      <span className="font-mono text-[11px] text-ink-faint ml-1">
                        HBAR
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-accent mt-1">
                      royalty {item.royaltyHbar} HBAR
                    </div>
                  </div>
                  <div>
                    {isSeller ? (
                      <CancelButton listingId={item.marketplaceListingId} />
                    ) : role === "consumer" ? (
                      <BuyButton listingId={item.marketplaceListingId} />
                    ) : (
                      <span
                        className="text-[11px] tracking-[0.14em] uppercase text-ink-faint"
                        title="Switch to Consumer to buy"
                      >
                        sign in as consumer
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {owned.length > 0 && (
        <section className="mb-16">
          <SectionHeading
            number="§ II"
            title={`Held by ${role}`}
            subtitle={`${owned.length} item${owned.length === 1 ? "" : "s"} eligible for resale`}
          />
          <div className="divide-y divide-rule border-t border-b border-rule-strong">
            {owned.map((item) => (
              <article
                key={`${item.tokenId}-${item.serial}`}
                className="grid grid-cols-[1fr_auto] items-center gap-5 py-5"
              >
                <div>
                  <div className="label mb-1">{item.category}</div>
                  <h3
                    className="font-display text-[22px] leading-[1.02] text-ink"
                    style={{ fontWeight: 500 }}
                  >
                    {item.name}
                  </h3>
                  <div className="mt-1 font-mono text-[10px] text-ink-faint">
                    {item.tokenId}/{item.serial}
                  </div>
                </div>
                {role === "manufacturer" ? (
                  <ListForm
                    tokenId={item.tokenId}
                    serial={item.serial}
                    defaultPrice={120}
                  />
                ) : (
                  <span
                    className="text-[11px] tracking-[0.14em] uppercase text-ink-faint"
                    title="Tier 0: only the Manufacturer may list"
                  >
                    switch to manufacturer to list
                  </span>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {soldRecords.length > 0 && (
        <section>
          <SectionHeading
            number="§ III"
            title="Recent sales"
            subtitle="with royalty paid"
          />
          <div className="divide-y divide-rule border-t border-b border-rule-strong">
            {soldRecords.map((s, i) => (
              <article
                key={`${s.tokenId}-${s.serial}-${i}`}
                className="grid grid-cols-[1fr_auto_auto] items-baseline gap-6 py-4"
              >
                <div>
                  <Link
                    href={`/p/${s.tokenId}-${s.serial}`}
                    className="font-display text-[18px] text-ink hover:text-accent"
                    style={{ fontWeight: 500 }}
                  >
                    {s.name}
                  </Link>
                  <div className="mt-1 text-[11px] font-mono text-ink-faint numeral">
                    {fmtConsensus(s.consensusTimestamp)} · to{" "}
                    {shortAccount(s.buyerAccountId)}
                  </div>
                </div>
                <div className="text-right font-mono text-[13px] text-ink">
                  {s.priceHbar} HBAR
                </div>
                <div className="text-right font-mono text-[11px] text-accent">
                  +{s.royaltyHbar} royalty
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
