import { MintForm } from "./MintForm";
import { getRoleFromCookie } from "@/lib/role";

export const dynamic = "force-dynamic";

export default async function MintPage() {
  const role = await getRoleFromCookie();
  return (
    <div className="rise">
      <div className="mb-12 max-w-2xl">
        <div className="label mb-3">§ II · Issue</div>
        <h1
          className="font-display text-[54px] md:text-[74px] leading-[0.95] tracking-[-0.025em] mb-5"
          style={{ fontWeight: 500 }}
        >
          Mint a{" "}
          <em className="italic" style={{ fontWeight: 500 }}>
            new passport
          </em>
          .
        </h1>
        <p className="text-[14px] leading-[1.65] text-ink-soft">
          Every minted passport is a non-fungible token on Hedera, an IPFS-like
          content-hashed dossier on disk, and a registered event on the lifecycle
          ledger. These three artefacts travel with the product for its lifetime.
        </p>
      </div>

      {role !== "manufacturer" && (
        <div className="mb-10 p-5 border-l-2 border-stamp bg-stamp/5 max-w-3xl">
          <div className="label text-stamp mb-1">Role mismatch</div>
          <div className="text-[13px] text-ink">
            You are currently signing as <b>{role}</b>. Switch the dropdown in the
            masthead to <b>Manufacturer</b> before issuing a passport; the API will
            otherwise reject the request.
          </div>
        </div>
      )}

      <MintForm />
    </div>
  );
}
