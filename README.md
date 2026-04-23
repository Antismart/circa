# circa

> A Digital Product Passport on Hedera. Every durable good gets an NFT-backed
> passport that travels with it — through repairs, resales, and recycling.
> The original manufacturer earns a royalty on every secondary sale, enforced
> at the consensus layer. Planned obsolescence becomes a bad business decision.

## Contents

- [What this is](#what-this-is)
- [The demo flow](#the-demo-flow)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Project structure](#project-structure)
- [Environment variables](#environment-variables)
- [On-chain artifacts](#on-chain-artifacts)
- [Routes](#routes)
- [Design notes](#design-notes)
- [Known limitations](#known-limitations)

---

## What this is

**circa** is a Digital Product Passport (DPP) system built on
[Hedera](https://hedera.com). Each physical object — an espresso machine, an
e-bike, an office chair — gets:

1. An **HTS non-fungible token** with a content-hashed pointer to the passport
   document. The collection is created with a **2.5% royalty fee schedule
   attached at the token layer**, so every future resale automatically pays
   the original manufacturer, enforced by Hedera consensus rather than honored
   by marketplace convention.
2. An **HCS-recorded lifecycle ledger** — mint, repair, transfer, resale
   events — signed by the actor who performed them, timestamped by consensus,
   and ordered immutably.
3. A **content-addressed passport document** (materials, carbon footprint,
   repairability, manufacturer, place of origin) whose sha256 is anchored in
   the NFT metadata and in the mint transaction.
4. A **Solidity marketplace contract** deployed to Hedera's EVM, acting as an
   on-chain ledger of listings and settlements. The actual atomic NFT + HBAR
   swap runs through HTS so the royalty fires at the protocol layer.

The web app is designed to look like what it is: an **official registration
certificate**. Newsreader italic display, IBM Plex Sans body, rule lines,
numbered sections, stamped verification marks. Not a SaaS dashboard.

### Why this exists

The EU's Ecodesign for Sustainable Products Regulation (ESPR) and Battery
Regulation require Digital Product Passports for most durable goods sold in
Europe between 2027 and 2030. Most entrants are building centralised SaaS.

A centralised passport is a worse passport — the regulation expects persistence
beyond the issuer's insolvency, and cannot cleanly support the cross-border,
multi-decade lifecycle of real products. Anchoring to a public ledger is not a
crypto flourish; it is the structurally correct shape for the obligation.

The royalty mechanic then flips an incentive. If a manufacturer earns a cut of
every secondary sale of their product, "make it last" becomes commercially
rational rather than virtuous.

---

## The demo flow

Built to rehearse and perform in about five minutes.

1. **Mint** — a manufacturer issues a new passport via `/mint`. Enter product
   details (or hit *Load example (Aurora Pro)*), submit. Behind the scenes
   the app: builds the JSON-LD passport, sha256-hashes it, mints an HTS NFT
   with a compact on-chain metadata pointer, saves the JSON to disk, writes
   a `mint` event to the HCS topic, and returns a printable QR code.
2. **Affix** — print the QR and stick it on the physical product.
3. **Scan** — a consumer scans with their phone. `/p/<tokenId>-<serial>` is
   a mobile-first certificate page showing the manufacturer, materials,
   carbon footprint, and the full lifecycle ledger. Verified-on-Hedera stamp,
   HashScan link, content hash visible.
4. **Repair** — a certified repairer logs a repair at `/repair`. Picks the
   passport from a dropdown, lists replaced parts, submits. An HCS `repair`
   event is signed by the repairer account. Optimistic cache shows it on the
   passport page immediately; the mirror node confirms within a few seconds.
5. **Resell** — the manufacturer lists the passport at `/marketplace`. The
   consumer switches roles and buys. The settlement is a single Hedera
   `TransferTransaction` moving NFT and HBAR atomically, with the 2.5%
   royalty deducted at consensus and paid to the manufacturer. A `resale`
   event lands in HCS. The contract records `Bought` on the EVM.
6. **Rescan** — the same QR now shows the resale in the timeline, including
   the new owner and the royalty that flowed back.

---

## How it works

```
┌───────────────────────────────────────────────────────────────┐
│  Physical product                                             │
│  └─ QR → https://localhost:3000/p/0.0.8747375-8               │
└─────────────────────────┬─────────────────────────────────────┘
                          │ scan
                          ▼
┌───────────────────────────────────────────────────────────────┐
│  Next.js 15 (App Router)                                      │
│  · /mint  · /p/[id]  · /marketplace  · /repair                │
│  · /api/{mint,passport,event,marketplace}                     │
└───────────────────────────┬───────────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────────┐
          ▼                 ▼                     ▼
┌─────────────────┐  ┌────────────────────────────────┐  ┌────────────────┐
│ Prisma / SQLite │  │ Hedera                         │  │ Local disk     │
│ (cache,         │  │ · HTS  collection + royalty    │  │ data/passports │
│  rebuildable)   │  │ · HCS  topic, lifecycle events │  │  *.json        │
│                 │  │ · EVM  CircaMarketplace        │  │                │
│                 │  │ · Mirror node  history reads   │  │                │
└─────────────────┘  └────────────────────────────────┘  └────────────────┘
```

Four architectural commitments:

- **On-chain is the source of truth. Off-chain is a cache.** The Prisma
  database and the disk-stored passport JSON can be fully rebuilt from Hedera
  mirror-node history.
- **HTS does the royalty.** The marketplace contract records listings and
  emits `Bought` events, but the real atomic NFT + HBAR settlement runs
  through `TransferTransaction` over HTS — which fires the 2.5% royalty at
  the protocol layer. No Solidity code computes royalty math.
- **Mirror-node lag is a first-class concern.** Every mutating API route
  writes an optimistic `Event` row in SQLite synchronously, so the passport
  view reflects new events in the timeline within milliseconds. Mirror-node
  confirmation reconciles on next render.
- **Role-based cookies, not real auth.** Three hardcoded roles —
  `manufacturer`, `consumer`, `repairer` — are switched in the masthead.
  Each role has a real Hedera account with real keys, funded at bootstrap.
  Perfect for a demo; replaced by DID-based auth in Tier 2.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend / API | Next.js 15 (App Router), TypeScript, Tailwind CSS v4 |
| Fonts | Newsreader (display), IBM Plex Sans (body), IBM Plex Mono (data) |
| Ledger SDK | `@hashgraph/sdk` |
| EVM contract | Solidity 0.8.24, Hardhat 2 |
| EVM client | `ethers` v6 |
| Database | Prisma + SQLite (dev) — migrates to Postgres in Tier 2 |
| QR generation | `qrcode` |
| Scripts | `tsx` for TypeScript scripts, `.cjs` for Hardhat-driven scripts |
| Package manager | pnpm 10 |

---

## Quick start

### Prerequisites

- Node 22+ (tested on 22.19)
- pnpm 10+
- A Hedera testnet account with ~150 HBAR. Get one at
  [portal.hedera.com](https://portal.hedera.com/) — the ECDSA-keyed default
  account works. The original ED25519 keys also work for the SDK operator.

### 1. Install

```sh
pnpm install
```

This also triggers Prisma's engine postinstall.

### 2. Configure

```sh
cp .env.example .env
```

Fill in `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY`. Leave every other
field blank — the setup scripts below will populate them.

### 3. Bootstrap the Hedera resources

```sh
pnpm bootstrap
```

This one-shot script, running on a fresh testnet account, produces a
complete working system in under a minute. It:

- Creates three demo-role accounts (manufacturer, consumer, repairer),
  each funded with 25 HBAR, each associated with the new NFT collection.
- Creates an HTS NFT collection with a **2.5% royalty fee schedule**
  attached at creation. Treasury and fee collector are the manufacturer.
- Creates an HCS topic for lifecycle events.
- Writes all six account IDs and two Hedera resource IDs back to `.env`.

Verify the royalty is on-chain by opening the HashScan link printed by the
script. The *Custom fees* section must show `2.5%` — if it doesn't, nothing
downstream will work as advertised.

### 4. Provision the EVM signer

```sh
pnpm setup:evm
```

Hardhat needs an ECDSA secp256k1 key to sign EVM transactions. The role
accounts above are ED25519, so this step creates a separate Hedera account
with an ECDSA key, funded with 50 HBAR, exclusively for EVM-side operator
use. Writes `HARDHAT_OPERATOR_*` to `.env`.

### 5. Compile, test, deploy the marketplace contract

```sh
pnpm hardhat:compile
pnpm hardhat:test             # 11 unit tests should pass
pnpm hardhat:deploy           # deploys CircaMarketplace to Hedera testnet
```

Writes `MARKETPLACE_EVM_ADDRESS` and `MARKETPLACE_CONTRACT_ID` to `.env`.

### 6. Set up the database

```sh
pnpm exec prisma db push --skip-generate
```

Creates `prisma/dev.db` from the schema.

### 7. Seed demo passports

```sh
pnpm seed
```

Mints three real testnet passports end-to-end: coffee machine, e-bike,
office chair. Each mint is a live HTS call and writes a real HCS event.
Expect ~5 seconds per product.

### 8. Run the app

```sh
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Start at the index for
the catalog, or scan one of the passports at `/p/<tokenId>-<serial>`.

### Optional: smoke-test the Hedera plumbing

```sh
pnpm smoke
```

Runs a standalone end-to-end test — mints one passport, writes one HCS
event, polls the mirror node until the event is confirmed. Useful on a
fresh testnet reset to verify the SDK layer before touching the UI.

### Reset for a fresh demo run

```sh
pnpm demo:reset
```

Refuses unless `HEDERA_NETWORK=testnet`. Wipes SQLite and on-disk passport
JSON, then re-seeds. Does **not** touch the HTS collection, the HCS topic,
the marketplace contract, or the role accounts — those persist across
resets, so QR codes already printed and affixed keep working.

---

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server on :3000 (compiles contracts first) |
| `pnpm build` / `pnpm start` | Production build and run |
| `pnpm bootstrap` | Create HTS collection (with royalty), HCS topic, 3 role accounts |
| `pnpm setup:evm` | Create ECDSA-keyed account for Hardhat/EVM signing |
| `pnpm seed` | Mint 3 demo passports on testnet |
| `pnpm smoke` | End-to-end SDK smoke test (mint + HCS event + mirror read) |
| `pnpm demo:reset` | Wipe local cache + re-seed (ledger state untouched) |
| `pnpm hardhat:compile` | Compile Solidity contracts |
| `pnpm hardhat:test` | Run 11 CircaMarketplace unit tests |
| `pnpm hardhat:deploy` | Deploy CircaMarketplace to Hedera testnet |
| `pnpm exec prisma db push` | Recreate the SQLite schema |

---

## Project structure

```
circa/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Editorial masthead, fonts, footer
│   ├── globals.css                   # Design tokens, stamp, field styles
│   ├── page.tsx                      # Landing catalog
│   ├── mint/                         # Manufacturer mint flow
│   ├── p/[tokenId]/                  # Public passport viewer (the money page)
│   ├── repair/                       # Repair event form
│   ├── marketplace/                  # Listings + buy/cancel
│   ├── _components/                  # Shared primitives (Stamp, DataRow, …)
│   └── api/                          # Route handlers
│       ├── mint/
│       ├── passport/[id]/
│       ├── event/
│       └── marketplace/
├── contracts/
│   └── CircaMarketplace.sol          # Record-keeping listing contract
├── lib/
│   ├── hedera.ts                     # Client singleton + env
│   ├── hts.ts                        # NFT mint/transfer/settle (atomic resale)
│   ├── hcs.ts                        # Submit event + mirror-node read
│   ├── passport.ts                   # Build / hash / save / load JSON
│   ├── marketplace.ts                # ethers v6 wrapper for the contract
│   ├── db.ts                         # Prisma singleton
│   ├── roles.ts                      # ROLES constants (client-safe)
│   └── role.ts                       # Server-only role → key / account mapping
├── prisma/
│   ├── schema.prisma                 # Passport / Event / Listing
│   └── dev.db                        # (gitignored)
├── scripts/
│   ├── bootstrap.ts                  # HTS + HCS + demo accounts
│   ├── setup-evm.ts                  # ECDSA account for Hardhat
│   ├── seed.ts                       # Mint 3 demo passports
│   ├── smoke.ts                      # End-to-end SDK smoke test
│   ├── demo-reset.ts                 # Wipe local cache + re-seed
│   └── deploy.cjs                    # Hardhat deploy
├── test/
│   └── CircaMarketplace.test.cjs     # 11 unit tests
├── data/
│   └── passports/                    # On-disk passport JSON (gitignored)
├── hardhat.config.cjs
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
└── package.json
```

---

## Environment variables

All managed in `.env`. The template is `.env.example`.

### You fill in

| Variable | Source |
|---|---|
| `HEDERA_OPERATOR_ID` | portal.hedera.com |
| `HEDERA_OPERATOR_KEY` | portal.hedera.com (DER or raw hex accepted) |

### Populated by `pnpm bootstrap`

| Variable | Description |
|---|---|
| `HTS_COLLECTION_ID` | NFT collection (with royalty attached) |
| `HCS_TOPIC_ID` | Lifecycle event topic |
| `MANUFACTURER_ACCOUNT_ID`, `MANUFACTURER_KEY` | Demo role |
| `CONSUMER_ACCOUNT_ID`, `CONSUMER_KEY` | Demo role |
| `REPAIRER_ACCOUNT_ID`, `REPAIRER_KEY` | Demo role |

### Populated by `pnpm setup:evm`

| Variable | Description |
|---|---|
| `HARDHAT_OPERATOR_ACCOUNT_ID` | ECDSA-keyed account (for EVM signing only) |
| `HARDHAT_OPERATOR_EVM_ADDRESS` | EVM form of the above |
| `HARDHAT_OPERATOR_EVM_KEY` | Raw hex secp256k1 key |

### Populated by `pnpm hardhat:deploy`

| Variable | Description |
|---|---|
| `MARKETPLACE_EVM_ADDRESS` | `0x…` |
| `MARKETPLACE_CONTRACT_ID` | `0.0.x` |

### Set by you, but already defaulted

| Variable | Default |
|---|---|
| `HEDERA_NETWORK` | `testnet` |
| `HEDERA_MIRROR_NODE` | `https://testnet.mirrornode.hedera.com` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |
| `DATABASE_URL` | `file:./dev.db` (resolves to `prisma/dev.db`) |

---

## On-chain artifacts

Current testnet deployment (from the reference environment this was built in):

| Artifact | ID | Link |
|---|---|---|
| HTS NFT collection | `0.0.8747375` | [HashScan](https://hashscan.io/testnet/token/0.0.8747375) |
| HCS lifecycle topic | `0.0.8747377` | [HashScan](https://hashscan.io/testnet/topic/0.0.8747377) |
| CircaMarketplace contract | `0.0.8748203` | [HashScan](https://hashscan.io/testnet/contract/0.0.8748203) |
| Manufacturer account | `0.0.8747372` | royalty fee collector |
| Consumer account | `0.0.8747373` | |
| Repairer account | `0.0.8747374` | |
| Hardhat operator (ECDSA) | `0.0.8748136` | EVM signer only |

These will be different after you run `pnpm bootstrap` with your own
operator.

---

## Routes

### Pages

| Path | Purpose |
|---|---|
| `/` | Landing catalog of seeded passports |
| `/mint` | Manufacturer issues a new passport |
| `/p/<tokenId>-<serial>` | Public passport viewer (the scan target) |
| `/repair` | Repairer logs a repair event |
| `/marketplace` | Listings, buy, sold history |

### API

| Method · Path | Guards | Description |
|---|---|---|
| `POST /api/mint` | role = manufacturer | Mints NFT, writes passport + HCS `mint` event, returns QR |
| `GET  /api/passport/[id]` | public | Returns passport JSON + merged HCS / optimistic events |
| `POST /api/event` | role allow-list per event type | Writes an HCS event and caches it locally |
| `POST /api/marketplace` | role guards per action | `list` / `buy` / `cancel` |

---

## Design notes

### Why the marketplace contract is a record-keeping ledger

An earlier version planned a custodial contract that would hold NFTs during
listing and call the HTS precompile on settlement. Two considerations pushed
against that:

1. **ED25519 role accounts can't sign EVM transactions.** The demo roles
   needed to sign real SDK transfers (so the presenter can demo "the
   manufacturer signs, the consumer signs"), which requires ED25519. Adding
   ECDSA keys to every role would complicate the demo and duplicate key
   material.
2. **The royalty works regardless.** Hedera's `CustomRoyaltyFee` is attached
   to the token, not to any contract. Every NFT transfer — SDK-driven or
   EVM-driven — deducts the royalty at consensus. A Solidity contract wasn't
   gaining us anything royalty-wise.

So the contract records listings and settlements on-chain, emits
`Listed`/`Bought`/`Cancelled` events, and lets the SDK do the atomic
NFT + HBAR swap. The demo narrative becomes:

> "Listings are recorded on our Solidity contract, and the NFT itself is
> transferred atomically with the payment through Hedera's token service.
> Hedera enforces the 2.5% royalty at the consensus layer — no marketplace
> can opt out."

### Why passport JSON is on disk, not IPFS

Tier 0 keeps content storage local. The content hash is anchored on-chain
(in the NFT metadata as the first 16 bytes of the sha256, in the mint
transaction as the full hash), so integrity is already guaranteed. IPFS
pinning with Filecoin-backed long-term storage is the Tier 2 upgrade, and
is a drop-in replacement — the resolver logic already treats the on-disk
file as a cache.

### Why roles are cookies, not auth

No login. No signup. One dropdown in the masthead switches between three
hardcoded accounts. Each account's private key lives in `.env`; the API
routes read the cookie to decide which key to sign with. Genuinely insecure
for production, genuinely the right trade for Tier 0 demo clarity.

Tier 2 replaces this with DID-based auth (`did:hedera` or `did:web` with
Hedera-anchored verification) and role-gated fields in the resolver
(consumer-public vs owner vs recycler vs regulator views).

### Typography and aesthetic

The app is styled as an official registration document, not a SaaS
dashboard. The product is a **passport** — an identity artefact — and should
read like one.

- **Newsreader** (variable serif, italic) for display type. Chosen over the
  generic Inter / Space Grotesk pattern.
- **IBM Plex Sans** for body — industrial/technical feel without being stiff.
- **IBM Plex Mono** for all on-chain identifiers, hashes, transaction IDs.
- Paper cream `#f4f1ea`, ink `#1a1a1a`, single forest-green accent `#1f3a2e`.
- Rule lines everywhere. Numbered sections. Small-caps labels. Stamped
  verification badge on the passport view.

---

## Known limitations

For the hackathon this is intentionally scoped to what proves the thesis.
Each of these is a planned Tier 2 deliverable.

- **Royalty is invisible when seller equals fee collector.** Because the
  manufacturer is both the royalty recipient and the first seller, the 2.5%
  on a first sale "flows back to the same account" and isn't visually
  distinct. Adding a second consumer account (and relaxing the
  manufacturer-only list restriction on the UI side) makes secondary resales
  show the royalty as a distinct transfer.
- **Role-based auth is a cookie.** No sessions, no signing, trust the
  client. Fine for a demo, wrong for production. DID-based replacement in
  Tier 2.
- **No GS1 Digital Link.** The canonical passport URI is
  `/p/<tokenId>-<serial>`, not `/01/<GTIN>/21/<serial>`. Changing that is a
  resolver-layer concern; the NFT metadata already uses a DL-compatible path.
- **No IPFS.** Passport JSON lives on disk. Swap in during Tier 2.
- **Mirror-node lag is softened by an optimistic cache**, which is correct
  for the demo but leaves a small window where the local view and the
  network disagree. The cache entries are tagged `pending` and yield to the
  mirror on reconciliation.
- **No EU registry bridge.** The final registry API hasn't been published
  yet (the registry launches 19 July 2026). Our canonical URIs are already
  GS1-compatible, and the `/api/passport/[id]` endpoint is the natural
  integration point.

---

## License

MIT.
