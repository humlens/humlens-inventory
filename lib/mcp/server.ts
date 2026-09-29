import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { auditMcp, guardMcpAction, resolveMcpActor } from './context';
import { listItems, getItem, createItem } from 'models/item';
import { listWarehouses } from 'models/warehouse';
import { listStockLevels } from 'models/stock';
import { listSuppliers, createSupplier } from 'models/supplier';
import { listPurchaseOrders } from 'models/purchaseOrder';
import { approveAgentAction, getAgentInbox, listAgentActions, rejectAgentAction, undoAgentAction } from 'models/agentAction';
import { runAction } from '@/lib/actions';
import { runReorderAgent } from '@/lib/ai/agents/reorderAgent';
import { draftStockMovementFromPrompt } from '@/lib/ai/agents/stockAdjustmentDraftAgent';
import { getDemandSummary } from '@/lib/ai/demand';

const json = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
});

// A single MCP server instance exposing the same inventory operations the
// web UI and REST API offer, as tools an external agent (Claude, or any MCP
// client) can call directly. Writes go through the same action registry
// (lib/actions) the agents and the inbox use, so there's one source of truth
// for validation and permissions regardless of entry point.
export function createInventoryMcpServer() {
  const server = new McpServer({ name: 'humlens-inventory', version: '0.1.0' });

  server.registerTool(
    'list_items',
    {
      title: 'List items',
      description: 'List catalog items for a team, optionally filtered by search term or category.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email(), search: z.string().optional() },
    },
    async ({ teamSlug, actingUserEmail, search }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'item', 'read');
      return json(await listItems(actor.team.id, { search }));
    }
  );

  server.registerTool(
    'get_item',
    {
      title: 'Get an item',
      description: 'Get full detail for one item, including stock levels by warehouse and recent stock transactions.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email(), itemId: z.string() },
    },
    async ({ teamSlug, actingUserEmail, itemId }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'item', 'read');
      return json(await getItem(actor.team.id, itemId));
    }
  );

  server.registerTool(
    'create_item',
    {
      title: 'Create an item',
      description: 'Add a new catalog item.',
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        sku: z.string(),
        name: z.string(),
        unitOfMeasure: z.string().default('unit'),
        costPrice: z.number().nonnegative().default(0),
        sellPrice: z.number().nonnegative().default(0),
        reorderPoint: z.number().int().nonnegative().default(0),
        reorderQty: z.number().int().nonnegative().default(0),
      },
    },
    async ({ teamSlug, actingUserEmail, ...params }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'item', 'create');
      return json(await auditMcp(actor, 'item', 'create', createItem({ teamId: actor.team.id, createdById: actor.user.id, ...params })));
    }
  );

  server.registerTool(
    'list_warehouses',
    {
      title: 'List warehouses',
      description: 'List warehouses for a team.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email() },
    },
    async ({ teamSlug, actingUserEmail }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'warehouse', 'read');
      return json(await listWarehouses(actor.team.id));
    }
  );

  server.registerTool(
    'get_stock_levels',
    {
      title: 'Get stock levels',
      description: 'List stock on-hand/reserved per item and warehouse, optionally filtered to low-stock items only.',
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        warehouseId: z.string().optional(),
        itemId: z.string().optional(),
        lowStockOnly: z.boolean().default(false),
      },
    },
    async ({ teamSlug, actingUserEmail, warehouseId, itemId, lowStockOnly }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'stock_level', 'read');
      return json(await listStockLevels(actor.team.id, { warehouseId, itemId, lowStockOnly }));
    }
  );

  server.registerTool(
    'get_demand',
    {
      title: 'Get sales velocity and stock runway',
      description:
        'Per item: units sold in the window, per day, days of stock left, units on open purchase orders, and whether it is below its reorder point. Sorted soonest-to-run-out first.',
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        days: z.number().int().min(7).max(365).default(30),
        search: z.string().optional(),
        limit: z.number().int().positive().max(200).default(50),
      },
    },
    async ({ teamSlug, actingUserEmail, days, search, limit }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'stock_level', 'read');
      return json(await getDemandSummary(actor.team.id, { days, search, limit }));
    }
  );

  server.registerTool(
    'record_stock_transaction',
    {
      title: 'Record a stock movement',
      description: 'Record a RECEIPT, ISSUE, ADJUSTMENT_IN, or ADJUSTMENT_OUT stock movement for an item at a warehouse.',
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        itemId: z.string(),
        warehouseId: z.string(),
        type: z.enum(['RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
        quantity: z.number().int().positive(),
        note: z.string().optional(),
      },
    },
    async ({ teamSlug, actingUserEmail, ...params }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'stock_transaction', 'create');
      return json(
        await auditMcp(
          actor,
          'stock_transaction',
          'create',
          runAction('stock.move', { teamId: actor.team.id, userId: actor.user.id, role: actor.teamMember.role, source: 'mcp' }, params)
        )
      );
    }
  );

  server.registerTool(
    'list_suppliers',
    {
      title: 'List suppliers',
      description: 'List suppliers for a team.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email() },
    },
    async ({ teamSlug, actingUserEmail }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'supplier', 'read');
      return json(await listSuppliers(actor.team.id));
    }
  );

  server.registerTool(
    'create_supplier',
    {
      title: 'Create a supplier',
      description: 'Onboard a new supplier record for the team.',
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        name: z.string(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        leadTimeDays: z.number().int().nonnegative().optional(),
      },
    },
    async ({ teamSlug, actingUserEmail, ...params }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'supplier', 'create');
      return json(await auditMcp(actor, 'supplier', 'create', createSupplier({ teamId: actor.team.id, createdById: actor.user.id, ...params })));
    }
  );

  server.registerTool(
    'list_purchase_orders',
    {
      title: 'List purchase orders',
      description: 'List replenishment purchase orders for a team.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email() },
    },
    async ({ teamSlug, actingUserEmail }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'purchase_order', 'read');
      return json(await listPurchaseOrders(actor.team.id));
    }
  );

  server.registerTool(
    'create_purchase_order',
    {
      title: 'Create a purchase order',
      description: 'Create a replenishment purchase order for a supplier, to be received into a warehouse.',
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        supplierId: z.string(),
        warehouseId: z.string(),
        currency: z.string().default('USD'),
        tax: z.number().nonnegative().default(0),
        shipping: z.number().nonnegative().default(0),
        lineItems: z
          .array(
            z.object({
              itemId: z.string(),
              description: z.string(),
              quantity: z.number().int().positive(),
              unitPrice: z.number().nonnegative(),
            })
          )
          .min(1),
      },
    },
    async ({ teamSlug, actingUserEmail, ...params }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'purchase_order', 'create');
      return json(
        await auditMcp(
          actor,
          'purchase_order',
          'create',
          runAction('purchaseOrder.draft', { teamId: actor.team.id, userId: actor.user.id, role: actor.teamMember.role, source: 'mcp' }, params)
        )
      );
    }
  );

  server.registerTool(
    'run_reorder_check',
    {
      title: 'Run the auto-reorder agent',
      description: 'Scans items below their reorder point and drafts purchase orders where policy allows, or logs why it could not.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email() },
    },
    async ({ teamSlug, actingUserEmail }) => {
      const actor = await resolveMcpActor(teamSlug, actingUserEmail);
      return json(await runReorderAgent(actor.team.id));
    }
  );

  server.registerTool(
    'draft_stock_movement_from_prompt',
    {
      title: 'Draft a stock movement from natural language',
      description:
        'Given a plain-language stock update (e.g. "received 50 units of blue widgets at the main warehouse"), have the AI match it to a known item/warehouse and extract a structured draft. Does not apply the movement — returns a draft for review.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email(), prompt: z.string() },
    },
    async ({ teamSlug, actingUserEmail, prompt }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'stock_transaction', 'create');
      return json(await draftStockMovementFromPrompt({ teamId: actor.team.id, prompt, requestedById: actor.user.id }));
    }
  );

  server.registerTool(
    'list_agent_actions',
    {
      title: 'List autonomous agent actions',
      description: 'List the audit log of autonomous actions the inventory agents have taken or proposed for this team.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email(), limit: z.number().int().positive().max(200).default(50) },
    },
    async ({ teamSlug, actingUserEmail, limit }) => {
      const actor = await resolveMcpActor(teamSlug, actingUserEmail);
      return json(await listAgentActions(actor.team.id, limit));
    }
  );

  server.registerTool(
    'get_agent_inbox',
    {
      title: 'Get the agent inbox',
      description:
        'What needs a person (proposed changes with their evidence), what agents did on their own in the last two weeks (with whether it can be undone), and unread findings.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email() },
    },
    async ({ teamSlug, actingUserEmail }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'agent_action', 'read');
      return json(await getAgentInbox(actor.team.id, { userId: actor.user.id, role: actor.teamMember.role }));
    }
  );

  const reviewTool = (name: string, title: string, description: string, run: typeof undoAgentAction) =>
    server.registerTool(
      name,
      { title, description, inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email(), actionId: z.string() } },
      async ({ teamSlug, actingUserEmail, actionId }) => {
        const actor = await resolveMcpActor(teamSlug, actingUserEmail);
        return json(
          await auditMcp(actor, 'agent_action', name === 'undo_agent_action' ? 'update' : name === 'reject_agent_action' ? 'reject' : 'approve',
            run(actor.team.id, actionId, { userId: actor.user.id, role: actor.teamMember.role }))
        );
      }
    );
  reviewTool('approve_agent_action', 'Approve an agent action', 'Apply a change an agent proposed, as the acting user.', (teamId, id, reviewer) => approveAgentAction(teamId, id, reviewer));
  reviewTool('reject_agent_action', 'Dismiss an agent action', 'Dismiss a change an agent proposed without applying it.', rejectAgentAction);
  reviewTool('undo_agent_action', 'Undo an agent action', 'Reverse a change an agent (or a person approving it) applied.', undoAgentAction);

  return server;
}
