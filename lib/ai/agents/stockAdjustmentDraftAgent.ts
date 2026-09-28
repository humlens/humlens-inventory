import { generateObject } from 'ai';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { logAgentAction, proposeAction } from 'models/agentAction';
import { getAgentModel } from '@/lib/ai/provider';

const draftSchema = z.object({
  itemSku: z.string().describe('The SKU of the matching item from the provided catalog list'),
  warehouseName: z.string().describe('The name of the matching warehouse from the provided list'),
  type: z.enum(['RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
  quantity: z.number().int().positive(),
  note: z.string(),
});

// Natural-language stock movement: "received 50 units of blue widgets at
// the main warehouse" -> a structured draft. It never writes to the stock
// ledger itself: it proposes a `stock.move` action for the person who asked,
// who reviews the prefilled form (or the inbox) and approves it. Approving
// applies it once, through the same action registry as everything else.
export async function draftStockMovementFromPrompt(params: { teamId: string; prompt: string; requestedById: string }) {
  const [items, warehouses] = await Promise.all([
    prisma.item.findMany({ where: { teamId: params.teamId, isActive: true }, select: { id: true, sku: true, name: true } }),
    prisma.warehouse.findMany({ where: { teamId: params.teamId }, select: { id: true, name: true } }),
  ]);

  const ai = await getAgentModel(params.teamId);

  const { object, usage } = await generateObject({
    model: ai.model,
    schema: draftSchema,
    prompt: `A warehouse staff member wrote this plain-language stock update:\n\n"${params.prompt}"\n\nAvailable items:\n${items.map((i) => `${i.sku}: ${i.name}`).join('\n')}\n\nAvailable warehouses:\n${warehouses.map((w) => w.name).join('\n')}\n\nMatch it to exactly one item SKU and one warehouse name from those lists, and extract the movement type and quantity. Use RECEIPT for stock coming in from a supplier, ISSUE for stock going out (a sale/consumption), and ADJUSTMENT_IN/ADJUSTMENT_OUT for corrections found/lost.`,
  });

  const item = items.find((i) => i.sku === object.itemSku);
  const warehouse = warehouses.find((w) => w.name === object.warehouseName);

  const matched = item && warehouse;
  const action = matched
    ? await proposeAction({
        teamId: params.teamId,
        type: 'NL_STOCK_ADJUSTMENT',
        agent: 'nl-stock',
        tool: 'stock.move',
        args: { itemId: item.id, warehouseId: warehouse.id, type: object.type, quantity: object.quantity, note: object.note },
        itemId: item.id,
        requestedById: params.requestedById,
        evidence: [{ label: 'Asked', value: params.prompt.slice(0, 200) }],
        reasoning: 'Matched the request to a known item and warehouse. Check the numbers and approve to record it.',
        aiModel: ai.id,
        aiTokens: usage?.totalTokens,
      })
    : await logAgentAction({
        teamId: params.teamId,
        type: 'NL_STOCK_ADJUSTMENT',
        status: 'PROPOSED',
        agent: 'nl-stock',
        title: 'Could not match a plain-English stock update',
        input: { prompt: params.prompt },
        output: { ...object, resolvedItemId: item?.id, resolvedWarehouseId: warehouse?.id },
        reasoning: 'Could not confidently match this to a known item or warehouse; the form was prefilled for a person to finish.',
        aiModel: ai.id,
        aiTokens: usage?.totalTokens,
        // Nothing to approve: the person finishes it in the form.
        reviewedAt: new Date(),
      });

  return {
    actionId: matched ? action.id : null,
    itemId: item?.id ?? null,
    warehouseId: warehouse?.id ?? null,
    type: object.type,
    quantity: object.quantity,
    note: object.note,
  };
}
