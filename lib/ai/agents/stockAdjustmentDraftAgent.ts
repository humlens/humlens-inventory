import { generateObject } from 'ai';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { logAgentAction } from 'models/agentAction';
import { agentModel } from '@/lib/ai/provider';

const draftSchema = z.object({
  itemSku: z.string().describe('The SKU of the matching item from the provided catalog list'),
  warehouseName: z.string().describe('The name of the matching warehouse from the provided list'),
  type: z.enum(['RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
  quantity: z.number().int().positive(),
  note: z.string(),
});

// Natural-language stock movement: "received 50 units of blue widgets at
// the main warehouse" -> a structured draft. This only ever returns a
// proposal — it never writes to the stock ledger itself. A human reviews
// the prefilled form and submits it, which goes through the same
// applyStockMovement() path (and validation) as any manual entry.
export async function draftStockMovementFromPrompt(params: { teamId: string; prompt: string }) {
  const [items, warehouses] = await Promise.all([
    prisma.item.findMany({ where: { teamId: params.teamId, isActive: true }, select: { id: true, sku: true, name: true } }),
    prisma.warehouse.findMany({ where: { teamId: params.teamId }, select: { id: true, name: true } }),
  ]);

  const { object } = await generateObject({
    model: agentModel,
    schema: draftSchema,
    prompt: `A warehouse staff member wrote this plain-language stock update:\n\n"${params.prompt}"\n\nAvailable items:\n${items.map((i) => `${i.sku}: ${i.name}`).join('\n')}\n\nAvailable warehouses:\n${warehouses.map((w) => w.name).join('\n')}\n\nMatch it to exactly one item SKU and one warehouse name from those lists, and extract the movement type and quantity. Use RECEIPT for stock coming in from a supplier, ISSUE for stock going out (a sale/consumption), and ADJUSTMENT_IN/ADJUSTMENT_OUT for corrections found/lost.`,
  });

  const item = items.find((i) => i.sku === object.itemSku);
  const warehouse = warehouses.find((w) => w.name === object.warehouseName);

  await logAgentAction({
    teamId: params.teamId,
    type: 'NL_STOCK_ADJUSTMENT',
    status: 'PROPOSED',
    itemId: item?.id,
    input: { prompt: params.prompt },
    output: { ...object, resolvedItemId: item?.id, resolvedWarehouseId: warehouse?.id },
    reasoning: item && warehouse
      ? 'Matched the request to a known item and warehouse. Review and submit the prefilled form to apply it.'
      : 'Could not confidently match this to a known item or warehouse — review the draft manually.',
  });

  return {
    itemId: item?.id ?? null,
    warehouseId: warehouse?.id ?? null,
    type: object.type,
    quantity: object.quantity,
    note: object.note,
  };
}
