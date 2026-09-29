import { z } from 'zod';

import { OPERATORS, type Operator } from '@/lib/advancedFilter';

// Server-side validation for filters stored in saved filters and table
// preferences.
const shortText = z.string().max(200);
export const filterConditionSchema = z.object({
  id: z.string().max(64),
  columnId: z.string().max(100),
  operator: z.enum(Object.keys(OPERATORS) as [Operator, ...Operator[]]),
  value: shortText.optional(),
  value2: shortText.optional(),
  values: z.array(shortText).max(100).optional(),
});

export const advancedFilterSchema = z.object({
  match: z.enum(['all', 'any']),
  conditions: z.array(filterConditionSchema).max(30),
});
