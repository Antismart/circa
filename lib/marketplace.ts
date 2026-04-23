import { Contract, JsonRpcProvider, Wallet, type InterfaceAbi } from "ethers";
import { requireEnv, optionalEnv } from "./hedera";
import artifact from "../artifacts/contracts/CircaMarketplace.sol/CircaMarketplace.json" assert { type: "json" };

const ABI: InterfaceAbi = artifact.abi as InterfaceAbi;

function getRpcUrl(): string {
  const network = optionalEnv("HEDERA_NETWORK") ?? "testnet";
  return network === "mainnet"
    ? "https://mainnet.hashio.io/api"
    : "https://testnet.hashio.io/api";
}

let _provider: JsonRpcProvider | null = null;
export function getProvider(): JsonRpcProvider {
  if (_provider) return _provider;
  _provider = new JsonRpcProvider(getRpcUrl());
  return _provider;
}

let _signer: Wallet | null = null;
export function getSigner(): Wallet {
  if (_signer) return _signer;
  const rawKey = requireEnv("HARDHAT_OPERATOR_EVM_KEY");
  const key = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  _signer = new Wallet(key, getProvider());
  return _signer;
}

export function getMarketplaceAddress(): string {
  return requireEnv("MARKETPLACE_EVM_ADDRESS");
}

export function getMarketplaceId(): string {
  return requireEnv("MARKETPLACE_CONTRACT_ID");
}

export function getMarketplaceAbi(): InterfaceAbi {
  return ABI;
}

function readOnly(): Contract {
  return new Contract(getMarketplaceAddress(), ABI, getProvider());
}

function writeable(): Contract {
  return new Contract(getMarketplaceAddress(), ABI, getSigner());
}

export interface ChainListing {
  sellerAccountId: string;
  serial: bigint;
  priceTinybars: bigint;
  active: boolean;
  sold: boolean;
  buyerAccountId: string;
  settlementTxId: string;
}

export async function readListing(listingId: bigint | number): Promise<ChainListing> {
  const c = readOnly();
  const raw = await c.getListing(BigInt(listingId));
  return {
    sellerAccountId: raw.sellerAccountId,
    serial: raw.serial,
    priceTinybars: raw.priceTinybars,
    active: raw.active,
    sold: raw.sold,
    buyerAccountId: raw.buyerAccountId,
    settlementTxId: raw.settlementTxId,
  };
}

export async function nextListingId(): Promise<bigint> {
  const c = readOnly();
  return (await c.nextListingId()) as bigint;
}

export interface ListResult {
  listingId: bigint;
  txHash: string;
}

export async function submitList(
  serial: number,
  priceTinybars: bigint,
  sellerAccountId: string
): Promise<ListResult> {
  const c = writeable();
  const expected = await nextListingId();
  const tx = await c.list(serial, priceTinybars, sellerAccountId);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("transaction receipt missing after list");
  return { listingId: expected, txHash: receipt.hash };
}

export async function submitMarkSold(
  listingId: bigint,
  buyerAccountId: string,
  settlementTxId: string
): Promise<string> {
  const c = writeable();
  const tx = await c.markSold(listingId, buyerAccountId, settlementTxId);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("transaction receipt missing after markSold");
  return receipt.hash;
}

export async function submitCancel(listingId: bigint): Promise<string> {
  const c = writeable();
  const tx = await c.cancel(listingId);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("transaction receipt missing after cancel");
  return receipt.hash;
}
