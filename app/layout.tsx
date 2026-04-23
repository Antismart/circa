import type { Metadata, Viewport } from "next";
import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import { AccountSwitcher } from "./_components/AccountSwitcher";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Circular — Digital Product Passport",
  description:
    "Every physical good gets a passport that travels with it. Proof of materials, repairs, ownership — anchored to Hedera, readable by anyone with a camera.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f1ea",
};

function Masthead() {
  const date = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return (
    <header className="border-b-2 border-rule-strong">
      <div className="max-w-5xl mx-auto px-5 pt-6 pb-3">
        <div className="flex items-baseline justify-between gap-4 text-[10px] tracking-[0.22em] uppercase text-ink-soft">
          <span className="numeral">Vol. 0 · No. 1</span>
          <span className="hidden md:inline">Digital Product Passport · Hedera Testnet</span>
          <span className="numeral">{date}</span>
        </div>
        <div className="mt-4 flex items-end justify-between gap-6">
          <Link href="/" className="block">
            <h1
              className="font-display leading-[0.85] text-[64px] md:text-[92px] tracking-[-0.02em] text-ink"
              style={{ fontWeight: 500, fontStyle: "italic" }}
            >
              Circular
            </h1>
          </Link>
          <div className="pb-2">
            <AccountSwitcher />
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-rule flex items-center justify-between gap-4 text-[11px] tracking-[0.16em] uppercase text-ink-soft">
          <nav className="flex items-center gap-5">
            <Link href="/" className="hover:text-ink transition">
              Index
            </Link>
            <span className="text-rule-strong">·</span>
            <Link href="/mint" className="hover:text-ink transition">
              Mint
            </Link>
            <span className="text-rule-strong">·</span>
            <Link href="/repair" className="hover:text-ink transition">
              Repair
            </Link>
            <span className="text-rule-strong">·</span>
            <Link href="/marketplace" className="hover:text-ink transition">
              Resale
            </Link>
          </nav>
          <span className="hidden sm:inline font-mono text-[10px] text-ink-faint">
            REG. CIRCA-DPP · v0
          </span>
        </div>
      </div>
    </header>
  );
}

function Colophon() {
  return (
    <footer className="mt-24 border-t border-rule-strong">
      <div className="max-w-5xl mx-auto px-5 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-[10px] tracking-[0.2em] uppercase text-ink-faint">
        <span>
          Issued on Hedera Testnet · Not for production use
        </span>
        <span className="font-mono normal-case tracking-normal text-[11px]">
          on-chain is truth · off-chain is cache
        </span>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body className="min-h-screen selection">
        <Masthead />
        <main className="max-w-5xl mx-auto px-5 py-10">{children}</main>
        <Colophon />
      </body>
    </html>
  );
}
