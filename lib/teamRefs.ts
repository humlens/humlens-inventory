import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';

// Records point at each other by id (a stock movement's item and warehouse,
// a PO's supplier). Ids come from requests, so before saving one, check it's
// this team's: otherwise a member could move another team's stock or attach
// another team's supplier to their own records.

type Id = string | null | undefined;
type Ids = Id | Id[];

const models = {
  item: { label: 'item', count: (ids: string[], teamId: string) => prisma.item.count({ where: { id: { in: ids }, teamId } }) },
  warehouse: { label: 'warehouse', count: (ids: string[], teamId: string) => prisma.warehouse.count({ where: { id: { in: ids }, teamId } }) },
  supplier: { label: 'supplier', count: (ids: string[], teamId: string) => prisma.supplier.count({ where: { id: { in: ids }, teamId } }) },
  category: { label: 'category', count: (ids: string[], teamId: string) => prisma.category.count({ where: { id: { in: ids }, teamId } }) },
} as const;

export type TeamRefs = Partial<Record<keyof typeof models, Ids>>;

/** Throws a 400 unless every id given belongs to `teamId`. Missing (null/undefined) ids are skipped. */
export async function assertTeamRefs(teamId: string, refs: TeamRefs) {
  await Promise.all(
    (Object.entries(refs) as [keyof typeof models, Ids][]).map(async ([kind, value]) => {
      const ids = [...new Set((Array.isArray(value) ? value : [value]).filter((id): id is string => !!id))];
      if (!ids.length) return;
      if ((await models[kind].count(ids, teamId)) !== ids.length) throw new ApiError(400, `That ${models[kind].label} isn't in this team.`);
    })
  );
}

/** Throws a 400 unless every PO line id given is a line of purchase order `poId`. */
export async function assertPoLines(poId: string, lineIds: Id[]) {
  const ids = [...new Set(lineIds.filter((id): id is string => !!id))];
  if (!ids.length) return;
  if ((await prisma.pOLineItem.count({ where: { id: { in: ids }, poId } })) !== ids.length) {
    throw new ApiError(400, "A line points at a purchase order line that isn't on this purchase order.");
  }
}
