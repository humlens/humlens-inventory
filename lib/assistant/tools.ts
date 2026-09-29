import type { AgentActionType, POStatus, Role } from '@prisma/client';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { can, type Action, type Resource } from '@/lib/permissions';
import { canRun, getAction } from '@/lib/actions';
import { getDemandSummary } from '@/lib/ai/demand';
import { runReorderAgent } from '@/lib/ai/agents/reorderAgent';
import { getItem } from 'models/item';
import { listStockLevels, listStockTransactions } from 'models/stock';
import { listWarehouses } from 'models/warehouse';
import { listSuppliers } from 'models/supplier';
import { listPurchaseOrders } from 'models/purchaseOrder';
import { getAgentInbox, proposeAction, type InboxEntry } from 'models/agentAction';

// The in-app assistant's tools. They run as the signed-in member, with that
// member's permissions. Lookups answer straight away. Changes are never made
// here: each one is proposed through the action registry, lands in the inbox
// as the member's own request, and the chat shows it with Approve / Dismiss
// buttons that call the inbox endpoints. So the assistant can prepare any
// change the member may make, but only a person applies it, and it can be
// undone like any other agent action.

export type AssistantMember = { teamId: string; teamSlug: string; userId: string; role: Role; currency: string };

/** What a proposal tool returns; the chat renders it as an approval card. */
export type ProposalCard = {
  kind: 'proposal';
  id: string;
  title: string;
  reasoning: string | null;
  status: string;
  canApprove: boolean;
  link: string | null;
};

const LIST_LIMIT = 40;

// Keeps tool results small enough for the model: numbers instead of Decimal
// strings and long lists cut short with a note.
function slim<T>(rows: T[], limit = LIST_LIMIT) {
  return { total: rows.length, shown: Math.min(rows.length, limit), rows: rows.slice(0, limit) };
}

const pageLink = (member: AssistantMember, path: string | null) => (path ? `/teams/${member.teamSlug}/${path}` : null);

export function assistantTools(member: AssistantMember): ToolSet {
  const { teamId } = member;

  const guard = (resource: Resource, action: Action) => {
    if (!can(member.role, resource, action)) {
      throw new ApiError(403, `Your role can't ${action} ${resource.replaceAll('_', ' ')}s.`);
    }
  };

  const card = (entry: Pick<InboxEntry, 'id' | 'title' | 'reasoning' | 'status' | 'canApprove' | 'link'>): ProposalCard => ({
    kind: 'proposal',
    id: entry.id,
    title: entry.title,
    reasoning: entry.reasoning,
    status: entry.status,
    canApprove: entry.canApprove,
    link: pageLink(member, entry.link),
  });

  // Files a change in the inbox as this member's own request.
  async function propose(params: { tool: string; type: AgentActionType; args: unknown; why: string; itemId?: string }) {
    if (!canRun(member.role, params.tool)) {
      const action = getAction(params.tool);
      throw new ApiError(403, `Your role can't ${action.permission} ${action.resource.replaceAll('_', ' ')}s, so this can't be prepared for you.`);
    }
    const row = await proposeAction({
      teamId,
      type: params.type,
      agent: 'assistant',
      tool: params.tool,
      args: params.args,
      itemId: params.itemId,
      requestedById: member.userId,
      reasoning: params.why,
      evidence: [{ label: 'Prepared by', value: 'Assistant' }],
    });
    const action = getAction(params.tool);
    return card({
      id: row.id,
      title: row.title ?? action.label,
      reasoning: row.reasoning,
      status: row.status,
      canApprove: true,
      link: action.link?.(row.args) ?? null,
    });
  }

  return {
    search_items: tool({
      description: 'Find catalog items by name or SKU. Returns stock on hand across warehouses, reorder settings and prices.',
      inputSchema: z.object({ search: z.string().optional().describe('Part of a name or SKU; omit to list everything') }),
      execute: async ({ search }) => {
        guard('item', 'read');
        const items = await prisma.item.findMany({
          where: {
            teamId,
            isActive: true,
            OR: search
              ? [
                  { name: { contains: search, mode: 'insensitive' } },
                  { sku: { contains: search, mode: 'insensitive' } },
                ]
              : undefined,
          },
          select: {
            id: true,
            sku: true,
            name: true,
            unitOfMeasure: true,
            costPrice: true,
            sellPrice: true,
            reorderPoint: true,
            reorderQty: true,
            category: { select: { name: true } },
            preferredSupplier: { select: { id: true, name: true } },
            stockLevels: { select: { onHand: true } },
          },
          orderBy: { name: 'asc' },
          take: 200,
        });
        return slim(
          items.map(({ stockLevels, costPrice, sellPrice, category, ...item }) => ({
            ...item,
            category: category?.name ?? null,
            costPrice: Number(costPrice),
            sellPrice: Number(sellPrice),
            onHand: stockLevels.reduce((sum, level) => sum + level.onHand, 0),
            link: pageLink(member, `items/${item.id}`),
          }))
        );
      },
    }),

    get_item: tool({
      description: 'Full detail for one item: stock by warehouse, supplier, and its 25 most recent stock movements.',
      inputSchema: z.object({ itemId: z.string() }),
      execute: async ({ itemId }) => {
        guard('item', 'read');
        const item = await getItem(teamId, itemId).catch(() => {
          throw new ApiError(404, 'No item with that id. Use search_items to find it.');
        });
        return { ...JSON.parse(JSON.stringify(item)), link: pageLink(member, `items/${item.id}`) };
      },
    }),

    get_demand: tool({
      description:
        'Sales velocity and runway per item: units sold in the window, per day, days of stock left, units already on open purchase orders, and whether it is below its reorder point. Sorted soonest-to-run-out first. Use this for "what should I reorder", "what is selling", "what will run out".',
      inputSchema: z.object({
        days: z.number().int().min(7).max(365).default(30).describe('How far back to measure sales'),
        search: z.string().optional().describe('Limit to items whose name or SKU contains this'),
        limit: z.number().int().min(1).max(100).default(30),
      }),
      execute: async ({ days, search, limit }) => {
        guard('item', 'read');
        guard('stock_level', 'read');
        const demand = await getDemandSummary(teamId, { days, search, limit });
        return { ...demand, items: demand.items.map((row) => ({ ...row, link: pageLink(member, `items/${row.itemId}`) })) };
      },
    }),

    get_stock_levels: tool({
      description: 'On-hand and reserved stock per item and warehouse, optionally only items at or below their reorder point.',
      inputSchema: z.object({
        warehouseId: z.string().optional(),
        itemId: z.string().optional(),
        lowStockOnly: z.boolean().default(false),
      }),
      execute: async (params) => {
        guard('stock_level', 'read');
        const levels = await listStockLevels(teamId, params);
        return slim(
          levels.map((level) => ({
            itemId: level.itemId,
            sku: level.item.sku,
            item: level.item.name,
            warehouseId: level.warehouseId,
            warehouse: level.warehouse.name,
            onHand: level.onHand,
            reserved: level.reserved,
            reorderPoint: level.item.reorderPoint,
          }))
        );
      },
    }),

    list_stock_movements: tool({
      description: 'Recent stock movements (receipts, issues, adjustments, transfers), newest first, optionally for one item or warehouse.',
      inputSchema: z.object({
        itemId: z.string().optional(),
        warehouseId: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
      execute: async (params) => {
        guard('stock_transaction', 'read');
        const rows = await listStockTransactions(teamId, params);
        return rows.map((row) => ({
          date: row.createdAt,
          type: row.type,
          quantity: row.quantity,
          sku: row.item.sku,
          item: row.item.name,
          warehouse: row.warehouse.name,
          by: row.performedBy?.name ?? null,
          note: row.note,
        }));
      },
    }),

    list_warehouses: tool({
      description: 'The team’s warehouses with their ids.',
      inputSchema: z.object({}),
      execute: async () => {
        guard('warehouse', 'read');
        const warehouses = await listWarehouses(teamId);
        return warehouses.map((w) => ({ id: w.id, name: w.name, isDefault: w.isDefault }));
      },
    }),

    list_suppliers: tool({
      description: 'Suppliers with ids, contact details and lead times.',
      inputSchema: z.object({}),
      execute: async () => {
        guard('supplier', 'read');
        const suppliers = await listSuppliers(teamId);
        return slim(
          suppliers.map((s) => ({ id: s.id, name: s.name, email: s.email, leadTimeDays: s.leadTimeDays, status: s.status, link: pageLink(member, `suppliers/${s.id}`) }))
        );
      },
    }),

    list_purchase_orders: tool({
      description: 'Replenishment purchase orders, newest first, optionally by status.',
      inputSchema: z.object({
        status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED']).optional(),
      }),
      execute: async ({ status }) => {
        guard('purchase_order', 'read');
        const orders = await listPurchaseOrders(teamId, { status: status as POStatus | undefined });
        return slim(
          orders.map((po) => ({
            id: po.id,
            poNumber: po.poNumber,
            status: po.status,
            supplier: po.supplier.name,
            warehouse: po.warehouse.name,
            lines: po._count.lineItems,
            total: Number(po.totalAmount),
            currency: po.currency,
            expectedDate: po.expectedDate,
            createdAt: po.createdAt,
            link: pageLink(member, `purchase-orders/${po.id}`),
          }))
        );
      },
    }),

    get_agent_inbox: tool({
      description:
        'What the agents need from people (proposed changes with evidence), what they did on their own recently, and unread findings. Use for "what needs my attention" or "what did the agents do".',
      inputSchema: z.object({}),
      execute: async () => {
        guard('agent_action', 'read');
        const inbox = await getAgentInbox(teamId, { userId: member.userId, role: member.role });
        const brief = (entries: InboxEntry[]) =>
          entries.slice(0, 15).map((e) => ({ id: e.id, title: e.title, status: e.status, agent: e.agent, reasoning: e.reasoning?.slice(0, 400), evidence: e.evidence, canApprove: e.canApprove, createdAt: e.createdAt }));
        return { counts: inbox.counts, needsYou: brief(inbox.needsYou), findings: brief(inbox.findings), recentlyDone: brief(inbox.done) };
      },
    }),

    show_inbox_item: tool({
      description:
        'Show one inbox item (by id from get_agent_inbox) as a card the person can approve or dismiss right here in the chat. Use when they want to act on something waiting for them.',
      inputSchema: z.object({ actionId: z.string() }),
      execute: async ({ actionId }) => {
        guard('agent_action', 'read');
        const inbox = await getAgentInbox(teamId, { userId: member.userId, role: member.role });
        const entry = [...inbox.needsYou, ...inbox.findings, ...inbox.done].find((e) => e.id === actionId);
        if (!entry) throw new ApiError(404, 'That item is no longer in the inbox.');
        return card(entry);
      },
    }),

    propose_stock_movement: tool({
      description:
        'Prepare a stock movement for the person to approve: RECEIPT (stock in from a supplier), ISSUE (sold or used), ADJUSTMENT_IN (found) or ADJUSTMENT_OUT (lost, damaged). Nothing changes until they approve the card.',
      inputSchema: z.object({
        itemId: z.string(),
        warehouseId: z.string(),
        type: z.enum(['RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
        quantity: z.number().int().positive(),
        note: z.string().max(500).optional(),
        why: z.string().describe('One sentence on why, shown on the card'),
      }),
      execute: ({ why, ...args }) => propose({ tool: 'stock.move', type: 'NL_STOCK_ADJUSTMENT', args, why, itemId: args.itemId }),
    }),

    propose_reorder_levels: tool({
      description:
        "Prepare a change to an item's reorder settings (the stock level that triggers a reorder, and how many to order each time), for the person to approve. This changes settings only; it does not order anything. To actually buy stock, use propose_purchase_order.",
      inputSchema: z.object({
        itemId: z.string(),
        reorderPoint: z.number().int().min(0),
        reorderQty: z.number().int().min(0),
        why: z.string().describe('One or two sentences citing the sales and lead-time numbers used'),
      }),
      execute: async ({ why, ...args }) => {
        const item = await prisma.item.findFirst({ where: { id: args.itemId, teamId }, select: { reorderPoint: true, reorderQty: true } });
        if (!item) throw new ApiError(404, 'No item with that id. Use search_items to find it.');
        if (item.reorderPoint === args.reorderPoint && item.reorderQty === args.reorderQty) {
          throw new ApiError(400, 'Those are already the item’s reorder settings, so there is nothing to change. To buy stock, use propose_purchase_order.');
        }
        return propose({ tool: 'item.setReorderLevels', type: 'REORDER_POINT_SUGGESTION', args, why, itemId: args.itemId });
      },
    }),

    propose_purchase_order: tool({
      description:
        "Prepare a draft purchase order to one supplier, for the person to approve — use this when stock needs buying (\"reorder\", \"order more\", \"restock\"). Size quantities from get_demand: cover the supplier's lead time plus about a month of sales, minus what's already on order; for items with no sales history use their usual order quantity. Unit prices default to each item's cost price. Approving creates the draft PO; it still goes through the usual PO approval before it is issued.",
      inputSchema: z.object({
        supplierId: z.string(),
        warehouseId: z.string().describe('Where the goods will be received'),
        lines: z.array(z.object({ itemId: z.string(), quantity: z.number().int().positive(), unitPrice: z.number().nonnegative().optional() })).min(1).max(50),
        notes: z.string().max(1000).optional(),
        why: z.string().describe('One or two sentences on why these quantities'),
      }),
      execute: async ({ supplierId, warehouseId, lines, notes, why }) => {
        const items = await prisma.item.findMany({
          where: { teamId, id: { in: lines.map((line) => line.itemId) } },
          select: { id: true, sku: true, name: true, costPrice: true },
        });
        const lineItems = lines.map((line) => {
          const item = items.find((i) => i.id === line.itemId);
          if (!item) throw new ApiError(404, `No item with id ${line.itemId}. Use search_items to find it.`);
          return { itemId: item.id, description: `${item.name} (${item.sku})`, quantity: line.quantity, unitPrice: line.unitPrice ?? Number(item.costPrice) };
        });
        return propose({
          tool: 'purchaseOrder.draft',
          type: 'AUTO_REORDER_SUGGESTION',
          args: { supplierId, warehouseId, currency: member.currency, notes, lineItems },
          why,
          itemId: lineItems.length === 1 ? lineItems[0]!.itemId : undefined,
        });
      },
    }),

    run_reorder_check: tool({
      description:
        'Run the reorder agent now: it checks every low item and drafts purchase orders (applying them itself only where the team’s auto-reorder policy allows). Results appear in the inbox.',
      inputSchema: z.object({}),
      execute: async () => {
        guard('purchase_order', 'create');
        const actions = await runReorderAgent(teamId);
        const rows = (Array.isArray(actions) ? actions : []) as { id: string; title: string | null; status: string }[];
        return { count: rows.length, actions: rows.slice(0, 20).map((a) => ({ id: a.id, title: a.title, status: a.status })) };
      },
    }),
  };
}
