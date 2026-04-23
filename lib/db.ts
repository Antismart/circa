import { PrismaClient } from "@prisma/client";

type GlobalWithPrisma = typeof globalThis & { __circaPrisma?: PrismaClient };

function getPrisma(): PrismaClient {
  const g = globalThis as GlobalWithPrisma;
  if (g.__circaPrisma) return g.__circaPrisma;
  const client = new PrismaClient();
  g.__circaPrisma = client;
  return client;
}

export const prisma = getPrisma();
