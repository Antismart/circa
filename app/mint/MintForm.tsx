"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, TextInput, Textarea } from "../_components/Field";
import { Stamp } from "../_components/Stamp";

const DEFAULT_MATERIALS = `[
  { "material": "steel-304",   "mass_g": 4200, "recycledPercent": 42 },
  { "material": "abs-plastic", "mass_g": 620,  "recycledPercent": 18 },
  { "material": "copper",      "mass_g": 380,  "recycledPercent": 55 }
]`;

interface MintResult {
  tokenId: string;
  serial: number;
  txId: string;
  publicUrl: string;
  qrDataUrl: string;
  contentHash: string;
  network: string;
}

type Status = "idle" | "submitting" | "ok" | "error";

export function MintForm() {
  const today = new Date().toISOString().slice(0, 10);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");
  const [result, setResult] = useState<MintResult | null>(null);
  const [form, setForm] = useState({
    name: "Aurora Pro Espresso Machine",
    category: "kitchen-appliance/espresso-machine",
    manufacturerName: "Aurora Kaffeemaschinen GmbH",
    country: "DE",
    city: "Gütersloh",
    dateOfManufacture: today,
    materials: DEFAULT_MATERIALS,
    cfMaterials: "52.1",
    cfManufacturing: "18.3",
    cfTransport: "17.0",
    repairabilityScore: "7.2",
    expectedLifetimeYears: "12",
  });

  function update<K extends keyof typeof form>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("Preparing passport dossier…");
    let materials: unknown;
    try {
      materials = JSON.parse(form.materials);
    } catch {
      setStatus("error");
      setMessage("Materials JSON is not valid. Fix the formatting and try again.");
      return;
    }

    try {
      setMessage("Anchoring passport to Hedera…");
      const res = await fetch("/api/mint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          manufacturerName: form.manufacturerName,
          country: form.country,
          city: form.city,
          dateOfManufacture: form.dateOfManufacture,
          materials,
          carbonFootprint: {
            materials: Number(form.cfMaterials),
            manufacturing: Number(form.cfManufacturing),
            transport: Number(form.cfTransport),
          },
          repairabilityScore: Number(form.repairabilityScore),
          expectedLifetimeYears: Number(form.expectedLifetimeYears),
        }),
      });
      const data = (await res.json()) as MintResult | { error: string };
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `HTTP ${res.status}`);
      }
      setResult(data);
      setStatus("ok");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Mint failed");
    }
  }

  if (status === "ok" && result) {
    const hashscan = `https://hashscan.io/${result.network}/transaction/${result.txId}`;
    return (
      <div className="rise">
        <div className="max-w-2xl">
          <div className="mb-6">
            <Stamp label="Passport Issued" sublabel={`Tx ${result.txId.slice(0, 16)}…`} />
          </div>
          <h2
            className="font-display text-[44px] md:text-[56px] leading-[1.02] tracking-[-0.02em] mb-4"
            style={{ fontWeight: 500 }}
          >
            Ready to be{" "}
            <em className="italic" style={{ fontWeight: 500 }}>
              affixed
            </em>
            .
          </h2>
          <p className="text-[14px] text-ink-soft leading-[1.65] mb-10 max-w-lg">
            Print and stick this QR onto the physical product. When anyone scans it
            — now or in ten years — they will see the passport you just minted.
          </p>

          <div className="grid md:grid-cols-[auto_1fr] gap-10 items-start border-t-2 border-rule-strong pt-8">
            <div className="relative">
              <img
                src={result.qrDataUrl}
                alt="QR code for the new passport"
                className="w-[260px] h-[260px] border border-rule-strong"
              />
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-paper px-3 text-[10px] tracking-[0.18em] uppercase text-ink-faint">
                Scan me
              </div>
            </div>
            <dl className="space-y-0 w-full">
              <div className="flex gap-6 py-2.5 border-b border-rule">
                <dt className="label w-[110px] shrink-0">Token</dt>
                <dd className="font-mono text-[13px] break-all">
                  {result.tokenId}/{result.serial}
                </dd>
              </div>
              <div className="flex gap-6 py-2.5 border-b border-rule items-start">
                <dt className="label w-[110px] shrink-0 pt-1">Content hash</dt>
                <dd className="font-mono text-[11px] break-all text-ink-soft">
                  {result.contentHash}
                </dd>
              </div>
              <div className="flex gap-6 py-2.5 border-b border-rule items-start">
                <dt className="label w-[110px] shrink-0 pt-1">Public URL</dt>
                <dd className="font-mono text-[12px] break-all">{result.publicUrl}</dd>
              </div>
              <div className="flex flex-wrap gap-3 mt-6">
                <Link href={`/p/${result.tokenId}-${result.serial}`} className="btn-primary">
                  Open passport →
                </Link>
                <a
                  href={result.qrDataUrl}
                  download={`passport-${result.tokenId}-${result.serial}.png`}
                  className="btn-ghost"
                >
                  Download QR
                </a>
                <a href={hashscan} target="_blank" rel="noreferrer" className="btn-ghost">
                  View on HashScan
                </a>
              </div>
            </dl>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-3xl rise">
      <div className="grid md:grid-cols-2 gap-x-10 gap-y-6">
        <div className="md:col-span-2">
          <Field label="Product name" number="1.">
            <TextInput value={form.name} onChange={update("name")} required />
          </Field>
        </div>
        <Field label="Category" number="2." hint="taxonomy / subtype">
          <TextInput value={form.category} onChange={update("category")} required />
        </Field>
        <Field label="Date of manufacture" number="3.">
          <TextInput
            type="date"
            value={form.dateOfManufacture}
            onChange={update("dateOfManufacture")}
            required
          />
        </Field>

        <div className="md:col-span-2 pt-4 mt-2 border-t border-rule">
          <div className="label mb-4">Manufacturer</div>
        </div>
        <div className="md:col-span-2">
          <Field label="Legal name" number="4.">
            <TextInput
              value={form.manufacturerName}
              onChange={update("manufacturerName")}
              required
            />
          </Field>
        </div>
        <Field label="Country" number="5." hint="ISO 3166-1 alpha-2">
          <TextInput
            value={form.country}
            onChange={update("country")}
            maxLength={2}
            required
          />
        </Field>
        <Field label="City" number="6.">
          <TextInput value={form.city} onChange={update("city")} required />
        </Field>

        <div className="md:col-span-2 pt-4 mt-2 border-t border-rule">
          <div className="label mb-4">Bill of materials</div>
        </div>
        <div className="md:col-span-2">
          <Field
            label="Composition"
            number="7."
            hint="JSON array · material, mass_g, recycledPercent"
          >
            <Textarea
              value={form.materials}
              onChange={update("materials")}
              rows={7}
              required
            />
          </Field>
        </div>

        <div className="md:col-span-2 pt-4 mt-2 border-t border-rule">
          <div className="label mb-4">Carbon footprint · kgCO₂e</div>
        </div>
        <Field label="Materials" number="8.a">
          <TextInput
            type="number"
            step="0.1"
            value={form.cfMaterials}
            onChange={update("cfMaterials")}
            required
          />
        </Field>
        <Field label="Manufacturing" number="8.b">
          <TextInput
            type="number"
            step="0.1"
            value={form.cfManufacturing}
            onChange={update("cfManufacturing")}
            required
          />
        </Field>
        <Field label="Transport" number="8.c">
          <TextInput
            type="number"
            step="0.1"
            value={form.cfTransport}
            onChange={update("cfTransport")}
            required
          />
        </Field>

        <div className="md:col-span-2 pt-4 mt-2 border-t border-rule">
          <div className="label mb-4">Durability claims</div>
        </div>
        <Field label="Repairability score" number="9." hint="0.0 – 10.0">
          <TextInput
            type="number"
            step="0.1"
            min="0"
            max="10"
            value={form.repairabilityScore}
            onChange={update("repairabilityScore")}
            required
          />
        </Field>
        <Field label="Expected lifetime" number="10." hint="years">
          <TextInput
            type="number"
            min="1"
            max="50"
            value={form.expectedLifetimeYears}
            onChange={update("expectedLifetimeYears")}
            required
          />
        </Field>
      </div>

      <div className="mt-10 pt-6 border-t-2 border-rule-strong flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={status === "submitting"}
          className="btn-primary"
        >
          {status === "submitting" ? "Anchoring…" : "Mint passport"}
        </button>
        <span className="text-[11px] tracking-[0.16em] uppercase text-ink-faint">
          Signing as Manufacturer · on-chain cost ≈ 0.05 HBAR
        </span>
      </div>

      {status === "submitting" && (
        <div className="mt-6 text-[13px] text-ink-soft italic">{message}</div>
      )}
      {status === "error" && (
        <div className="mt-6 p-4 border-l-2 border-stamp bg-stamp/5">
          <div className="label text-stamp mb-1">Issue returned</div>
          <div className="text-[13px] text-ink">{message}</div>
        </div>
      )}
    </form>
  );
}
