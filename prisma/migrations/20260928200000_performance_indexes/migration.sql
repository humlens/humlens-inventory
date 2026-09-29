-- Composite indexes for the queries the agents, inbox and lists run most.
-- CreateIndex
CREATE INDEX "AgentAction_teamId_tool_createdAt_idx" ON "AgentAction"("teamId", "tool", "createdAt");

-- CreateIndex
CREATE INDEX "AgentAction_teamId_type_createdAt_idx" ON "AgentAction"("teamId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrder_teamId_status_idx" ON "PurchaseOrder"("teamId", "status");

-- CreateIndex
CREATE INDEX "StockTransaction_teamId_type_createdAt_idx" ON "StockTransaction"("teamId", "type", "createdAt");

