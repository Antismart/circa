import {
  AccountId,
  Hbar,
  HbarUnit,
  Long,
  PrivateKey,
  TokenAssociateTransaction,
  TokenId,
  TokenMintTransaction,
  TransferTransaction,
} from "@hashgraph/sdk";
import { getClient, operatorKey, requireEnv } from "./hedera";

export const MAX_METADATA_BYTES = 100;

export function getCollectionId(): TokenId {
  return TokenId.fromString(requireEnv("HTS_COLLECTION_ID"));
}

export function buildNftMetadata(dlPath: string, contentHash: string): Uint8Array {
  const hashHex = contentHash.replace(/^sha256:/, "").slice(0, 32);
  const encoded = new TextEncoder().encode(`${dlPath}#${hashHex}`);
  if (encoded.byteLength > MAX_METADATA_BYTES) {
    throw new Error(
      `NFT metadata is ${encoded.byteLength} bytes, exceeds ${MAX_METADATA_BYTES}-byte HTS limit. Shorten the DL path.`
    );
  }
  return encoded;
}

export interface MintResult {
  tokenId: string;
  serial: number;
  txId: string;
  consensusTimestamp: string | null;
}

export async function mintPassportNft(
  metadata: Uint8Array
): Promise<MintResult> {
  const client = getClient();
  const tokenId = getCollectionId();

  const tx = new TokenMintTransaction()
    .setTokenId(tokenId)
    .setMetadata([metadata])
    .freezeWith(client);
  const signed = await tx.sign(operatorKey);
  const response = await signed.execute(client);
  const receipt = await response.getReceipt(client);

  const serials = receipt.serials;
  if (!serials || serials.length === 0) {
    throw new Error("Mint returned no serial numbers");
  }
  const serial = serials[0].toNumber();

  const record = await response.getRecord(client);

  return {
    tokenId: tokenId.toString(),
    serial,
    txId: response.transactionId.toString(),
    consensusTimestamp: record.consensusTimestamp
      ? record.consensusTimestamp.toString()
      : null,
  };
}

export interface TransferArgs {
  serial: number;
  fromAccountId: string;
  fromKey: PrivateKey;
  toAccountId: string;
  priceTinybars: bigint;
}

export async function transferPassportNft(args: TransferArgs): Promise<string> {
  const client = getClient();
  const tokenId = getCollectionId();
  const from = AccountId.fromString(args.fromAccountId);
  const to = AccountId.fromString(args.toAccountId);

  const price = Hbar.from(Long.fromString(args.priceTinybars.toString()), HbarUnit.Tinybar);

  const tx = new TransferTransaction()
    .addNftTransfer(tokenId, args.serial, from, to)
    .addHbarTransfer(to, price.negated())
    .addHbarTransfer(from, price)
    .freezeWith(client);

  const signedByFrom = await tx.sign(args.fromKey);
  const submit = await signedByFrom.execute(client);
  await submit.getReceipt(client);
  return submit.transactionId.toString();
}

export async function associateAccountWithCollection(
  accountId: string,
  accountKey: PrivateKey
): Promise<void> {
  const client = getClient();
  try {
    const tx = new TokenAssociateTransaction()
      .setAccountId(accountId)
      .setTokenIds([getCollectionId()])
      .freezeWith(client);
    const signed = await tx.sign(accountKey);
    const submit = await signed.execute(client);
    await submit.getReceipt(client);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT")) return;
    throw err;
  }
}
