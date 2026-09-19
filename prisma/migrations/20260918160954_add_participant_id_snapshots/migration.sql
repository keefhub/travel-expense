-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "payerParticipantIdSnapshot" TEXT;

-- AlterTable
ALTER TABLE "ExpenseShare" ADD COLUMN     "participantIdSnapshot" TEXT;

-- Backfill: rows created before the snapshot columns existed.
UPDATE "Expense" SET "payerParticipantIdSnapshot" = "payerParticipantId" WHERE "payerParticipantId" IS NOT NULL;
UPDATE "ExpenseShare" SET "participantIdSnapshot" = "participantId" WHERE "participantId" IS NOT NULL;
