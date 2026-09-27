-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgentActionStatus" ADD VALUE 'REVERTED';
ALTER TYPE "AgentActionStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "AgentAction" ADD COLUMN     "agent" TEXT,
ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "aiTokens" INTEGER,
ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "appliedById" TEXT,
ADD COLUMN     "args" JSONB,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "evidence" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "requestedById" TEXT,
ADD COLUMN     "result" JSONB,
ADD COLUMN     "revertedAt" TIMESTAMP(3),
ADD COLUMN     "revertedById" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "tool" TEXT;

-- CreateIndex
CREATE INDEX "AgentAction_teamId_status_idx" ON "AgentAction"("teamId", "status");


-- Backfill: name the agent behind existing rows and describe their changes
-- in the registry's terms, so older suggestions can be approved and older
-- drafts undone from the inbox.
UPDATE "AgentAction" SET "agent" = CASE "type"
  WHEN 'AUTO_REORDER_SUGGESTION' THEN CASE WHEN "output"->>'routedTo' = 'procurement' THEN 'procurement-reorder' ELSE 'reorder' END
  WHEN 'REORDER_POINT_SUGGESTION' THEN 'reorder-tuning'
  WHEN 'DEAD_STOCK_ALERT' THEN 'dead-stock'
  WHEN 'CYCLE_COUNT_ANOMALY' THEN 'cycle-count'
  WHEN 'NL_STOCK_ADJUSTMENT' THEN 'nl-stock'
  ELSE NULL END;

-- Reorder level suggestions: the change is setting the item's two levels;
-- ones already applied remember the levels they replaced.
UPDATE "AgentAction"
SET "tool" = 'item.setReorderLevels',
    "args" = jsonb_build_object('itemId', "itemId", 'reorderPoint', "output"->'reorderPoint', 'reorderQty', "output"->'reorderQty'),
    "result" = CASE WHEN "status" = 'EXECUTED' THEN jsonb_build_object('previous', "input"->'current') ELSE NULL END,
    "appliedAt" = CASE WHEN "status" = 'EXECUTED' THEN "reviewedAt" ELSE NULL END,
    "appliedById" = CASE WHEN "status" = 'EXECUTED' THEN "reviewedById" ELSE NULL END
WHERE "type" = 'REORDER_POINT_SUGGESTION' AND "itemId" IS NOT NULL;

-- Purchase orders the reorder agent drafted on its own.
UPDATE "AgentAction"
SET "tool" = 'purchaseOrder.draft',
    "result" = jsonb_build_object('purchaseOrderId', "purchaseOrderId", 'poNumber', "output"->'poNumber'),
    "appliedAt" = "createdAt"
WHERE "type" = 'AUTO_REORDER_SUGGESTION' AND "status" = 'EXECUTED' AND "purchaseOrderId" IS NOT NULL;

-- Older plain-English drafts were applied (or not) through the stock form,
-- so there's nothing left to approve: close them.
UPDATE "AgentAction" SET "reviewedAt" = "createdAt"
WHERE "type" = 'NL_STOCK_ADJUSTMENT' AND "status" = 'PROPOSED';
