"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Field, TextInput, Textarea, Select, Combobox } from "../_components/Field";
import { Stamp } from "../_components/Stamp";

const COUNTRY_OPTIONS = [
  { value: "DE", label: "Germany" },
  { value: "NL", label: "Netherlands" },
  { value: "SE", label: "Sweden" },
  { value: "DK", label: "Denmark" },
  { value: "NO", label: "Norway" },
  { value: "FI", label: "Finland" },
  { value: "FR", label: "France" },
  { value: "IT", label: "Italy" },
  { value: "ES", label: "Spain" },
  { value: "PT", label: "Portugal" },
  { value: "AT", label: "Austria" },
  { value: "BE", label: "Belgium" },
  { value: "IE", label: "Ireland" },
  { value: "CH", label: "Switzerland" },
  { value: "GB", label: "United Kingdom" },
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "JP", label: "Japan" },
];

const CATEGORY_SUGGESTIONS = [
  "kitchen-appliance/espresso-machine",
  "kitchen-appliance/coffee-grinder",
  "kitchen-appliance/kettle",
  "kitchen-appliance/toaster",
  "kitchen-appliance/refrigerator",
  "mobility/e-bike",
  "mobility/scooter",
  "mobility/skateboard",
  "furniture/office-chair",
  "furniture/desk",
  "furniture/lamp",
  "electronics/laptop",
  "electronics/phone",
  "electronics/headphones",
  "apparel/shoes",
  "apparel/jacket",
];

const MATERIALS_PLACEHOLDER = `[
  { "material": "steel-304",   "mass_g": 4200, "recycledPercent": 42 },
  { "material": "abs-plastic", "mass_g": 620,  "recycledPercent": 18 }
]`;

type FormState = {
  name: string;
  category: string;
  manufacturerName: string;
  country: string;
  city: string;
  dateOfManufacture: string;
  materials: string;
  cfMaterials: string;
  cfManufacturing: string;
  cfTransport: string;
  repairabilityScore: string;
  expectedLifetimeYears: string;
};

function emptyForm(today: string): FormState {
  return {
    name: "",
    category: "",
    manufacturerName: "",
    country: "",
    city: "",
    dateOfManufacture: today,
    materials: "",
    cfMaterials: "",
    cfManufacturing: "",
    cfTransport: "",
    repairabilityScore: "",
    expectedLifetimeYears: "",
  };
}

function demoExample(today: string): FormState {
  return {
    name: "Aurora Pro Espresso Machine",
    category: "kitchen-appliance/espresso-machine",
    manufacturerName: "Aurora Kaffeemaschinen GmbH",
    country: "DE",
    city: "Gütersloh",
    dateOfManufacture: today,
    materials: `[
  { "material": "steel-304",   "mass_g": 4200, "recycledPercent": 42 },
  { "material": "abs-plastic", "mass_g": 620,  "recycledPercent": 18 },
  { "material": "copper",      "mass_g": 380,  "recycledPercent": 55 }
]`,
    cfMaterials: "52.1",
    cfManufacturing: "18.3",
    cfTransport: "17.0",
    repairabilityScore: "7.2",
    expectedLifetimeYears: "12",
  };
}

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

type MaterialsCheck =
  | { state: "empty" }
  | { state: "invalid"; message: string }
  | { state: "valid"; count: number; totalMass: number; avgRecycled: number };

function checkMaterials(text: string): MaterialsCheck {
  const trimmed = text.trim();
  if (!trimmed) return { state: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    return {
      state: "invalid",
      message: e instanceof Error ? e.message : "Invalid JSON",
    };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { state: "invalid", message: "Expected a non-empty array" };
  }
  let totalMass = 0;
  let recycledSum = 0;
  for (let i = 0; i < parsed.length; i++) {
    const m = parsed[i] as {
      material?: unknown;
      mass_g?: unknown;
      recycledPercent?: unknown;
    };
    if (typeof m.material !== "string" || !m.material.trim()) {
      return { state: "invalid", message: `Row ${i + 1}: missing "material"` };
    }
    if (typeof m.mass_g !== "number" || !Number.isFinite(m.mass_g)) {
      return { state: "invalid", message: `Row ${i + 1}: "mass_g" must be a number` };
    }
    if (typeof m.recycledPercent !== "number" || !Number.isFinite(m.recycledPercent)) {
      return {
        state: "invalid",
        message: `Row ${i + 1}: "recycledPercent" must be a number`,
      };
    }
    totalMass += m.mass_g;
    recycledSum += (m.recycledPercent * m.mass_g);
  }
  const avgRecycled = totalMass > 0 ? recycledSum / totalMass : 0;
  return { state: "valid", count: parsed.length, totalMass, avgRecycled };
}

export function MintForm() {
  const today = new Date().toISOString().slice(0, 10);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");
  const [result, setResult] = useState<MintResult | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(today));

  const materialsCheck = useMemo(() => checkMaterials(form.materials), [form.materials]);
  const carbonTotal = useMemo(() => {
    const m = Number(form.cfMaterials) || 0;
    const f = Number(form.cfManufacturing) || 0;
    const t = Number(form.cfTransport) || 0;
    const anySet =
      form.cfMaterials !== "" ||
      form.cfManufacturing !== "" ||
      form.cfTransport !== "";
    return anySet ? m + f + t : null;
  }, [form.cfMaterials, form.cfManufacturing, form.cfTransport]);

  function update<K extends keyof FormState>(key: K) {
    return (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function loadExample() {
    setForm(demoExample(today));
    setStatus("idle");
    setMessage("");
  }

  function clearForm() {
    setForm(emptyForm(today));
    setStatus("idle");
    setMessage("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("Preparing passport dossier…");
    if (materialsCheck.state !== "valid") {
      setStatus("error");
      setMessage(
        materialsCheck.state === "empty"
          ? "Add the bill of materials before minting."
          : materialsCheck.message
      );
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
          materials: JSON.parse(form.materials),
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

  const isFilled = form.name !== "" || form.materials !== "";
  const fmtMass = (g: number) => g.toLocaleString("en-US");

  return (
    <form onSubmit={submit} className="max-w-3xl rise">
      <div className="flex items-center justify-between pb-4 mb-8 border-b border-rule">
        <div className="label">Enter product details</div>
        <div className="flex items-center gap-4">
          {!isFilled ? (
            <button
              type="button"
              onClick={loadExample}
              className="text-[11px] tracking-[0.16em] uppercase text-accent underline decoration-rule-strong underline-offset-4 hover:decoration-accent"
            >
              ↳ Load example (Aurora Pro)
            </button>
          ) : (
            <button
              type="button"
              onClick={clearForm}
              className="text-[11px] tracking-[0.16em] uppercase text-ink-faint underline decoration-transparent hover:decoration-rule-strong underline-offset-4"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-x-10 gap-y-6">
        <div className="md:col-span-2">
          <Field label="Product name" number="1.">
            <TextInput
              value={form.name}
              onChange={update("name")}
              placeholder="e.g. Aurora Pro Espresso Machine"
              required
            />
          </Field>
        </div>
        <Field label="Category" number="2." hint="pick or type your own">
          <Combobox
            listId="mint-category-options"
            value={form.category}
            onChange={update("category")}
            suggestions={CATEGORY_SUGGESTIONS}
            placeholder="kitchen-appliance/…"
            required
          />
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
              placeholder="e.g. Aurora Kaffeemaschinen GmbH"
              required
            />
          </Field>
        </div>
        <Field label="Country" number="5." hint="country of manufacture">
          <Select
            value={form.country}
            onChange={update("country")}
            options={COUNTRY_OPTIONS}
            placeholder="Select country"
            required
          />
        </Field>
        <Field label="City" number="6.">
          <TextInput
            value={form.city}
            onChange={update("city")}
            placeholder="e.g. Gütersloh"
            required
          />
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
              placeholder={MATERIALS_PLACEHOLDER}
              required
            />
            <div className="mt-2 flex items-center gap-3 text-[11px] font-mono">
              {materialsCheck.state === "empty" && (
                <span className="text-ink-faint italic">
                  waiting for JSON…
                </span>
              )}
              {materialsCheck.state === "invalid" && (
                <span className="text-stamp">
                  ⚠ {materialsCheck.message}
                </span>
              )}
              {materialsCheck.state === "valid" && (
                <span className="text-accent">
                  ✓ {materialsCheck.count} material
                  {materialsCheck.count === 1 ? "" : "s"} ·{" "}
                  {fmtMass(materialsCheck.totalMass)} g total ·{" "}
                  {materialsCheck.avgRecycled.toFixed(0)}% recycled (weighted)
                </span>
              )}
            </div>
          </Field>
        </div>

        <div className="md:col-span-2 pt-4 mt-2 border-t border-rule flex items-baseline justify-between">
          <div className="label">Carbon footprint · kgCO₂e</div>
          {carbonTotal !== null && (
            <div className="font-mono text-[11px] text-accent">
              total {carbonTotal.toFixed(1)} kg
            </div>
          )}
        </div>
        <Field label="Materials" number="8.a">
          <TextInput
            type="number"
            step="0.1"
            value={form.cfMaterials}
            onChange={update("cfMaterials")}
            placeholder="0.0"
            required
          />
        </Field>
        <Field label="Manufacturing" number="8.b">
          <TextInput
            type="number"
            step="0.1"
            value={form.cfManufacturing}
            onChange={update("cfManufacturing")}
            placeholder="0.0"
            required
          />
        </Field>
        <Field label="Transport" number="8.c">
          <TextInput
            type="number"
            step="0.1"
            value={form.cfTransport}
            onChange={update("cfTransport")}
            placeholder="0.0"
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
            placeholder="7.2"
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
            placeholder="12"
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
