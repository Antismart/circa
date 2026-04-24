"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Status = "idle" | "busy" | "ok" | "error";

export function ListForm({
  tokenId,
  serial,
  defaultPrice,
}: {
  tokenId: string;
  serial: number;
  defaultPrice: number;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(String(defaultPrice));
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    setMessage("Recording listing on-chain…");
    try {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "list",
          tokenId,
          serial,
          priceHbar: Number(price),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setStatus("ok");
      setMessage(`Listed at ${price} HBAR (listing #${data.listingId})`);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "List failed");
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-3 whitespace-nowrap"
    >
      <div className="relative">
        <input
          type="number"
          min="1"
          step="1"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={status === "busy"}
          className="w-24 bg-transparent border-b border-rule-strong pl-1 pr-6 py-1 font-mono text-[13px] text-right focus:border-accent outline-none"
        />
        <span className="absolute right-0 bottom-1 text-[10px] font-mono text-ink-faint pointer-events-none">
          HBAR
        </span>
      </div>
      <button
        type="submit"
        disabled={status === "busy"}
        className="btn-ghost disabled:opacity-50"
      >
        {status === "busy" ? "Listing…" : "List"}
      </button>
      {status === "error" && (
        <span className="text-[11px] text-stamp" title={message}>
          ⚠ {message.slice(0, 40)}
        </span>
      )}
    </form>
  );
}

interface BuyResult {
  listingId: string;
  settlementTxId: string;
  contractTxHash: string;
  sellerAccountId: string;
  buyerAccountId: string;
  priceHbar: number;
  royaltyHbar: number;
  resaleEventSeqNum: number;
  tokenId: string;
  serial: number;
  gtin: string;
}

export function BuyButton({
  listingId,
  disabled,
}: {
  listingId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<BuyResult | null>(null);
  const [message, setMessage] = useState("");

  async function click() {
    setStatus("busy");
    setMessage("Settling on Hedera…");
    try {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "buy", listingId: Number(listingId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as BuyResult);
      setStatus("ok");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Buy failed");
    }
  }

  if (status === "ok" && result) {
    const network = process.env.NEXT_PUBLIC_HEDERA_NETWORK ?? "testnet";
    const hashscan = `https://hashscan.io/${network}/transaction/${encodeURIComponent(result.settlementTxId)}`;
    return (
      <div className="col-span-full border-l-2 border-accent bg-accent/5 px-5 py-4 rise">
        <div className="flex items-baseline gap-4 mb-3">
          <span className="stamp" style={{ transform: "rotate(-0.8deg)" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M2 6.2L4.8 9L10 3.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Settled</span>
          </span>
          <span className="font-mono text-[11px] text-ink-faint">
            SEQ {String(result.resaleEventSeqNum).padStart(4, "0")}
          </span>
        </div>
        <div className="grid md:grid-cols-3 gap-5 font-mono text-[12px]">
          <div>
            <div className="label mb-1 font-body">Price paid</div>
            <div className="font-display text-[22px] text-ink numeral">
              {result.priceHbar} <span className="text-[11px] text-ink-faint">HBAR</span>
            </div>
          </div>
          <div>
            <div className="label mb-1 font-body">Royalty to manufacturer</div>
            <div className="font-display text-[22px] text-accent numeral">
              {result.royaltyHbar.toFixed(3)}{" "}
              <span className="text-[11px] text-ink-faint">HBAR · enforced by HTS</span>
            </div>
          </div>
          <div>
            <div className="label mb-1 font-body">Settlement</div>
            <a
              href={hashscan}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-rule-strong underline-offset-4 hover:decoration-accent hover:text-accent break-all text-[10px]"
            >
              {result.settlementTxId}
            </a>
          </div>
        </div>
        <div className="mt-4">
          <Link
            href={`/01/${result.gtin}/21/${result.serial}`}
            className="btn-primary"
          >
            Rescan passport →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={click}
        disabled={disabled || status === "busy"}
        className="btn-primary disabled:opacity-50"
      >
        {status === "busy" ? "Settling…" : "Buy"}
      </button>
      {status === "error" && (
        <span className="text-[11px] text-stamp max-w-[200px] text-right" title={message}>
          ⚠ {message.slice(0, 48)}
        </span>
      )}
    </div>
  );
}

export function CancelButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");

  async function click() {
    setStatus("busy");
    try {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel", listingId: Number(listingId) }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setStatus("idle");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <button
      type="button"
      onClick={click}
      disabled={status === "busy"}
      className="text-[11px] tracking-[0.14em] uppercase text-ink-faint hover:text-stamp underline decoration-transparent hover:decoration-stamp underline-offset-4"
    >
      {status === "busy" ? "Cancelling…" : "Withdraw"}
    </button>
  );
}
