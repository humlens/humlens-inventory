import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { apiFetch, apiPost, apiPut } from '@/lib/fetcher';

type ItemFormValues = {
  sku: string;
  name: string;
  unitOfMeasure: string;
  costPrice: number;
  sellPrice: number;
  reorderPoint: number;
  reorderQty: number;
  preferredSupplierId: string;
};

// Shared by the items list page (create, inside a SidebarModal) and the
// item detail page (edit, inside the same modal) so the field list and
// submit logic only exist once.
export default function ItemForm({
  slug,
  itemId,
  initialValues,
  onSuccess,
}: {
  slug: string;
  itemId?: string;
  initialValues?: Partial<ItemFormValues> & { preferredSupplier?: { id: string } | null };
  onSuccess: (item: { id: string }) => void;
}) {
  const [form, setForm] = useState<ItemFormValues>({
    sku: initialValues?.sku ?? '',
    name: initialValues?.name ?? '',
    unitOfMeasure: initialValues?.unitOfMeasure ?? 'unit',
    costPrice: initialValues?.costPrice ?? 0,
    sellPrice: initialValues?.sellPrice ?? 0,
    reorderPoint: initialValues?.reorderPoint ?? 0,
    reorderQty: initialValues?.reorderQty ?? 0,
    preferredSupplierId: initialValues?.preferredSupplierId ?? initialValues?.preferredSupplier?.id ?? '',
  });
  const [loading, setLoading] = useState(false);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/suppliers`),
    enabled: !!slug,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form, preferredSupplierId: form.preferredSupplierId || undefined };
      const item = itemId
        ? await apiPut<{ id: string }>(`/api/teams/${slug}/items/${itemId}`, payload)
        : await apiPost<{ id: string }>(`/api/teams/${slug}/items`, payload);
      toast.success(itemId ? 'Item updated.' : 'Item created.');
      onSuccess(item);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">SKU</label>
          <input className="input" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </div>
        <div>
          <label className="label">Unit of measure</label>
          <input
            className="input"
            value={form.unitOfMeasure}
            onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="label">Name</label>
        <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Cost price</label>
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={form.costPrice}
            onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Sell price</label>
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={form.sellPrice}
            onChange={(e) => setForm({ ...form, sellPrice: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Reorder point</label>
          <input
            className="input"
            type="number"
            min={0}
            value={form.reorderPoint}
            onChange={(e) => setForm({ ...form, reorderPoint: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Reorder qty</label>
          <input
            className="input"
            type="number"
            min={0}
            value={form.reorderQty}
            onChange={(e) => setForm({ ...form, reorderQty: Number(e.target.value) })}
          />
        </div>
      </div>
      <div>
        <label className="label">Preferred supplier</label>
        <select
          className="input"
          value={form.preferredSupplierId}
          onChange={(e) => setForm({ ...form, preferredSupplierId: e.target.value })}
        >
          <option value="">None — auto-reorder suggestions only</option>
          {suppliers?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Setting a preferred supplier lets the AI agent draft a purchase order automatically when this item hits its
          reorder point (subject to your team&apos;s agent policy).
        </p>
      </div>
      <button className="btn-primary w-full" type="submit" disabled={loading}>
        {loading ? (itemId ? 'Saving…' : 'Creating…') : itemId ? 'Save changes' : 'Create item'}
      </button>
    </form>
  );
}
