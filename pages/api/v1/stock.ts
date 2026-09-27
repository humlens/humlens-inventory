import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { ApiError } from '@/lib/errors';
import { guardApiKey, handleV1Error } from '@/lib/apiKey';
import { validateWithSchema } from '@/lib/zod';
import { listStockForSync } from 'models/storeSync';

const querySchema = z.object({
  since: z.string().datetime({ offset: true }).optional(),
  warehouseId: z.string().optional(),
  skus: z.string().optional(),
});

// GET /api/v1/stock?since=<ISO>&warehouseId=&skus=A,B — stock per SKU.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') return res.status(405).end();
    const { teamId } = await guardApiKey(req, res, 'stock_level', 'read');
    const query = validateWithSchema(querySchema, req.query);
    const skus = query.skus?.split(',').map((sku) => sku.trim()).filter(Boolean);
    if (skus && skus.length > 500) throw new ApiError(400, 'Ask for at most 500 SKUs at a time.');
    res.status(200).json(
      await listStockForSync(teamId, { since: query.since ? new Date(query.since) : undefined, warehouseId: query.warehouseId, skus })
    );
  } catch (error) {
    handleV1Error(res, error);
  }
}
