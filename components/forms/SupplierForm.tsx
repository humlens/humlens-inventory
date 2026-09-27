import { useState } from 'react';
import toast from 'react-hot-toast';

import { apiPost, apiPut } from '@/lib/fetcher';

type SupplierFormValues = { name: string; email: string; phone: string; leadTimeDays: number };

// Shared by the suppliers list page (create, inside a SidebarModal) and the
// supplier detail page (edit, inside the same modal) so the field list and
// submit logic only exist once.
export default function SupplierForm({
  slug,
  supplierId,
  initialValues,
  onSuccess,
}: {
  slug: string;
  supplierId?: string;
  initialValues?: Partial<SupplierFormValues>;
  onSuccess: (supplier: { id: string }) => void;
}) {
  const [form, setForm] = useState<SupplierFormValues>({
    name: initialValues?.name ?? '',
    email: initialValues?.email ?? '',
    phone: initialValues?.phone ?? '',
    leadTimeDays: initialValues?.leadTimeDays ?? 7,
  });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const supplier = supplierId
        ? await apiPut<{ id: string }>(`/api/teams/${slug}/suppliers/${supplierId}`, form)
        : await apiPost<{ id: string }>(`/api/teams/${slug}/suppliers`, form);
      toast.success(supplierId ? 'Supplier updated.' : 'Supplier created.');
      onSuccess(supplier);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Name</label>
        <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div>
        <label className="label">Email</label>
        <input
          className="input"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Phone</label>
        <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div>
        <label className="label">Lead time (days)</label>
        <input
          className="input"
          type="number"
          min={0}
          value={form.leadTimeDays}
          onChange={(e) => setForm({ ...form, leadTimeDays: Number(e.target.value) })}
        />
      </div>
      <button className="btn-primary w-full" type="submit" disabled={loading}>
        {loading ? (supplierId ? 'Saving…' : 'Creating…') : supplierId ? 'Save changes' : 'Create supplier'}
      </button>
    </form>
  );
}
