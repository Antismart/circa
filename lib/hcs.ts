import { PrivateKey, TopicId, TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import { getClient, mirrorFetch, operatorKey, requireEnv } from "./hedera";

export const MAX_MESSAGE_BYTES = 900;

export type DppEventType = "mint" | "repair" | "resale" | "transfer";

interface BaseEvent {
  type: DppEventType;
  tokenId: string;
  serial: number;
  actor: string;
  timestamp: string;
}

export interface MintEvent extends BaseEvent {
  type: "mint";
  contentHash: string;
}

export interface RepairEvent extends BaseEvent {
  type: "repair";
  partsReplaced: Array<{ part: string; count: number }>;
  notes?: string;
  embodiedCarbon_kgCO2e?: number;
}

export interface ResaleEvent extends BaseEvent {
  type: "resale";
  from: string;
  to: string;
  priceTinybars: string;
  evmTxHash?: string;
}

export interface TransferEvent extends BaseEvent {
  type: "transfer";
  from: string;
  to: string;
}

export type DppEvent = MintEvent | RepairEvent | ResaleEvent | TransferEvent;

export interface PersistedEvent {
  event: DppEvent;
  sequenceNumber: number;
  consensusTimestamp: string;
}

function getTopicId(): TopicId {
  return TopicId.fromString(requireEnv("HCS_TOPIC_ID"));
}

export interface SubmitResult {
  txId: string;
  sequenceNumber: number;
  consensusTimestamp: string;
}

export async function submitEvent(
  event: DppEvent,
  signerKey: PrivateKey = operatorKey
): Promise<SubmitResult> {
  const payload = JSON.stringify(event);
  const bytes = new TextEncoder().encode(payload);
  if (bytes.byteLength > MAX_MESSAGE_BYTES) {
    throw new Error(
      `HCS event payload is ${bytes.byteLength} bytes, exceeds ${MAX_MESSAGE_BYTES}-byte budget. Move evidence off-chain.`
    );
  }

  const client = getClient();
  const tx = new TopicMessageSubmitTransaction()
    .setTopicId(getTopicId())
    .setMessage(payload)
    .freezeWith(client);
  const signed = await tx.sign(signerKey);
  const submit = await signed.execute(client);
  const receipt = await submit.getReceipt(client);
  const record = await submit.getRecord(client);

  const seqAny = receipt.topicSequenceNumber;
  const sequenceNumber =
    seqAny && typeof (seqAny as { toNumber?: () => number }).toNumber === "function"
      ? (seqAny as { toNumber: () => number }).toNumber()
      : Number(seqAny);

  return {
    txId: submit.transactionId.toString(),
    sequenceNumber,
    consensusTimestamp: record.consensusTimestamp
      ? record.consensusTimestamp.toString()
      : new Date().toISOString(),
  };
}

interface MirrorMessage {
  consensus_timestamp: string;
  message: string;
  sequence_number: number;
  topic_id: string;
}

interface MirrorMessagesResponse {
  messages: MirrorMessage[];
  links?: { next: string | null };
}

export async function fetchAllMessages(): Promise<PersistedEvent[]> {
  const topicId = requireEnv("HCS_TOPIC_ID");
  const all: PersistedEvent[] = [];
  let next: string | null = `/api/v1/topics/${topicId}/messages?limit=100&order=asc`;

  while (next) {
    const res: MirrorMessagesResponse = await mirrorFetch<MirrorMessagesResponse>(next);
    for (const m of res.messages) {
      const decoded = Buffer.from(m.message, "base64").toString("utf8");
      try {
        const event = JSON.parse(decoded) as DppEvent;
        all.push({
          event,
          sequenceNumber: m.sequence_number,
          consensusTimestamp: m.consensus_timestamp,
        });
      } catch {
        // skip malformed messages (other topics, other schemas)
      }
    }
    next = res.links?.next ?? null;
  }

  return all;
}

export async function getEventsForToken(
  tokenId: string,
  serial: number
): Promise<PersistedEvent[]> {
  const all = await fetchAllMessages();
  return all
    .filter(
      (e) =>
        typeof e.event.tokenId === "string" &&
        e.event.tokenId === tokenId &&
        Number(e.event.serial) === Number(serial)
    )
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}
