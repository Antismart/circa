"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, TextInput, Textarea } from "../_components/Field";
import { Stamp } from "../_components/Stamp";

interface RepairResult {
  sequenceNumber: number;
  consensusTimestamp: string;
  txId: string;
  actor: string;
  tokenId: string;
  serial: number;
}

type Status = "idle" | "submitting" | "ok" | "error";

export function RepairForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<RepairResult | null>(null);
  const [passportId, setPassportId] = useState("");
  const [notes, setNotes] = useState("");
  const [partsText, setPartsText] = useState("descaler valve, 1");
  const [embodied, setEmbodied] = useState("3.2");

  function parsePassport(): { tokenId: string; serial: number } | null {
    const i = passportId.trim().lastIndexOf("-");
    if (i === -1) return null;
    const tokenId = passportId.slice(0, i).trim();
    const serial = Number(passportId.slice(i + 1));
    if (!tokenId || !Number.isFinite(serial) || serial <= 0) return null;
    return { tokenId, serial };
  }

  function parseParts(): Array<{ part: string; count: number }> {
    return partsText
      .split("\n")
      .flatMap((line) => line.split(";"))
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, count] = line.split(",").map((s) => s.trim());
        return { part: name, count: Number(count) > 0 ? Number(count) : 1 };
      })
      .filter((p) => p.part);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("Submitting repair event to consensus service…");
    const parsed = parsePassport();
    if (!parsed) {
      setStatus("error");
      setMessage("Passport ID must look like 0.0.xxxx-1.");
      return;
    }
    try {
      const res = await fetch("/api/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tokenId: parsed.tokenId,
          serial: parsed.serial,
          type: "repair",
          partsReplaced: parseParts(),
          notes,
          embodiedCarbon_kgCO2e: Number(embodied) || undefined,
        }),
      });
      const data = (await res.json()) as RepairResult | { error: string };
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `HTTP ${res.status}`);
      }
      setResult({ ...data, tokenId: parsed.tokenId, serial: parsed.serial });
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Submit failed");
    }
  }

  if (status === "ok" && result) {
    return (
      <div className="rise max-w-2xl">
        <div className="mb-5">
          <Stamp
            label="Repair logged"
            sublabel={`SEQ ${String(result.sequenceNumber).padStart(4, "0")}`}
          />
        </div>
        <h2
          className="font-display text-[44px] md:text-[56px] leading-[1.02] tracking-[-0.02em] mb-6"
          style={{ fontWeight: 500 }}
        >
          An{" "}
          <em className="italic" style={{ fontWeight: 500 }}>
            event
          </em>
          {" "}has been written to the ledger.
        </h2>
        <p className="text-[14px] text-ink-soft leading-[1.65] mb-8 max-w-lg">
          It is now part of this product&apos;s permanent history. Mirror nodes will
          surface it within a few seconds; your local cache already shows it.
        </p>
        <dl className="border-t border-b border-rule-strong py-6 space-y-1">
          <div className="flex gap-6 py-2 border-b border-rule">
            <dt className="label w-[140px] shrink-0">Passport</dt>
            <dd className="font-mono text-[13px] break-all">
              {result.tokenId}/{result.serial}
            </dd>
          </div>
          <div className="flex gap-6 py-2 border-b border-rule">
            <dt className="label w-[140px] shrink-0">Signed by</dt>
            <dd className="font-mono text-[13px]">{result.actor}</dd>
          </div>
          <div className="flex gap-6 py-2 border-b border-rule">
            <dt className="label w-[140px] shrink-0">Consensus</dt>
            <dd className="font-mono text-[13px]">{result.consensusTimestamp}</dd>
          </div>
          <div className="flex gap-6 py-2">
            <dt className="label w-[140px] shrink-0">Sequence</dt>
            <dd className="font-mono text-[13px] numeral">
              # {String(result.sequenceNumber).padStart(4, "0")}
            </dd>
          </div>
        </dl>
        <div className="mt-8 flex gap-3">
          <Link
            href={`/p/${result.tokenId}-${result.serial}`}
            className="btn-primary"
          >
            View updated passport →
          </Link>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setResult(null);
              setStatus("idle");
            }}
          >
            Log another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-2xl rise">
      <div className="grid md:grid-cols-2 gap-x-10 gap-y-6">
        <div className="md:col-span-2">
          <Field
            label="Passport identifier"
            number="1."
            hint="token-serial · e.g. 0.0.8747375-8"
          >
            <TextInput
              value={passportId}
              onChange={(e) => setPassportId(e.target.value)}
              placeholder="0.0.xxxx-1"
              required
            />
          </Field>
        </div>

        <div className="md:col-span-2">
          <Field
            label="Parts replaced"
            number="2."
            hint="one per line · name, count"
          >
            <Textarea
              value={partsText}
              onChange={(e) => setPartsText(e.target.value)}
              rows={4}
              required
            />
          </Field>
        </div>

        <div className="md:col-span-2">
          <Field label="Service notes" number="3." hint="free text, ≤ 500 chars">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Descaler valve replaced; limescale buildup on boiler intake."
            />
          </Field>
        </div>

        <Field label="Embodied carbon" number="4." hint="kgCO₂e of new parts">
          <TextInput
            type="number"
            step="0.1"
            value={embodied}
            onChange={(e) => setEmbodied(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-10 pt-6 border-t-2 border-rule-strong flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={status === "submitting"}
          className="btn-primary"
        >
          {status === "submitting" ? "Submitting…" : "Log repair"}
        </button>
        <span className="text-[11px] tracking-[0.16em] uppercase text-ink-faint">
          Signing as Repairer · written to HCS topic
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
