import { z, ZodType } from 'zod';
import { ApiError } from '@/lib/errors';

// Constrained to ZodType<T, any, any> (not the ZodSchema alias, which pins
// Input = Output) so a schema with .default()/.optional() fields — where
// Input and Output legitimately differ — still infers T as the Output type.
export function validateWithSchema<T>(schema: ZodType<T, any, any>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(422, result.error.issues.map((i) => i.message).join(', '));
  }
  return result.data;
}

// A list page's route pattern (e.g. "/teams/[slug]/items"), used to key
// table preferences and saved filters.
export const tableKeySchema = z.string().regex(/^\/[\w\-/[\]]{1,200}$/, 'Invalid table key.');

export const teamSlugSchema = z.object({
  slug: z.string().min(1),
});

export const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  currency: z.string().min(1).max(10).optional(),
});

export const createWarehouseSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  isDefault: z.boolean().default(false),
});

export const createCategorySchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().optional(),
});

export const createItemSchema = z.object({
  sku: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  unitOfMeasure: z.string().default('unit'),
  costPrice: z.number().nonnegative().default(0),
  sellPrice: z.number().nonnegative().default(0),
  barcode: z.string().optional(),
  reorderPoint: z.number().int().nonnegative().default(0),
  reorderQty: z.number().int().nonnegative().default(0),
  preferredSupplierId: z.string().optional(),
});

export const stockTransactionSchema = z.object({
  itemId: z.string().min(1),
  warehouseId: z.string().min(1),
  type: z.enum(['RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
  quantity: z.number().int().positive(),
  reference: z.string().optional(),
  note: z.string().optional(),
});

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1),
  currency: z.string().default('USD'),
  expectedDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  lineItems: z
    .array(
      z.object({
        itemId: z.string().min(1),
        description: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .min(1),
  tax: z.number().nonnegative().default(0),
  shipping: z.number().nonnegative().default(0),
});

export const createGoodsReceiptSchema = z.object({
  poId: z.string().min(1),
  warehouseId: z.string().min(1),
  notes: z.string().optional(),
  lineItems: z
    .array(
      z.object({
        poLineItemId: z.string().min(1),
        quantityReceived: z.number().int().positive(),
        condition: z.string().optional(),
      })
    )
    .min(1),
});

export const createStockTransferSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  note: z.string().optional(),
});

export const createStockAdjustmentSchema = z.object({
  itemId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantityDelta: z.number().int().refine((v) => v !== 0, 'Adjustment quantity cannot be zero.'),
  reason: z.enum(['CYCLE_COUNT', 'DAMAGE', 'LOSS', 'FOUND', 'CORRECTION', 'OTHER']),
  note: z.string().optional(),
});

export const createCycleCountSchema = z.object({
  warehouseId: z.string().min(1),
  name: z.string().min(1).max(200),
  itemIds: z.array(z.string()).min(1),
});

export const submitCycleCountLineSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().min(1),
        countedQty: z.number().int().nonnegative(),
      })
    )
    .min(1),
});

export const updateAgentPolicySchema = z.object({
  autoReorderEnabled: z.boolean().optional(),
  autoReorderMaxAmount: z.number().nonnegative().optional(),
  autoReorderCategories: z.array(z.string()).optional(),
  deadStockThresholdDays: z.number().int().positive().optional(),
  cycleCountVarianceThresholdPct: z.number().min(0).max(100).optional(),
});
