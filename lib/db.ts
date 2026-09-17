import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

declare global {
  var __prismaClient: PrismaClient | undefined;
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });

export const db = globalThis.__prismaClient ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalThis.__prismaClient = db;
