-- The reorder agent used to log "blocked by policy" rows with nothing to
-- approve. It now prepares the purchase order draft and asks for approval
-- instead, so close the old rows: they'd otherwise sit in the inbox and stop
-- the agent from raising the item again.
UPDATE "AgentAction" SET "reviewedAt" = "createdAt"
WHERE "type" = 'AUTO_REORDER_SUGGESTION' AND "status" = 'REJECTED_BY_POLICY' AND "tool" IS NULL AND "reviewedAt" IS NULL;

-- Give older rows a readable one-line title for the inbox.
UPDATE "AgentAction" SET "title" = CASE
  WHEN "tool" = 'purchaseOrder.draft' AND "output"->>'poNumber' IS NOT NULL THEN 'Drafted purchase order ' || ("output"->>'poNumber')
  WHEN "type" = 'AUTO_REORDER_SUGGESTION' AND "output"->>'routedTo' = 'procurement' THEN 'Requested a restock in Procurement'
  WHEN "type" = 'AUTO_REORDER_SUGGESTION' THEN 'Reorder check'
  WHEN "type" = 'REORDER_POINT_SUGGESTION' THEN 'New reorder levels suggested'
  WHEN "type" = 'DEAD_STOCK_ALERT' THEN 'Items with no recent sales'
  WHEN "type" = 'CYCLE_COUNT_ANOMALY' THEN 'Cycle count differences to check'
  WHEN "type" = 'NL_STOCK_ADJUSTMENT' THEN 'Plain-English stock update'
  ELSE 'Agent action' END
WHERE "title" IS NULL;
