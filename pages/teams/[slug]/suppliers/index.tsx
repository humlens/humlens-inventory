import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import NewButton from '@/components/NewButton';
import SidebarModal from '@/components/SidebarModal';
import SupplierForm from '@/components/forms/SupplierForm';
import { apiFetch } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';
import { useNewHotkey } from '@/lib/useNewHotkey';
import { useOpenNewFromQuery } from '@/lib/useOpenNewFromQuery';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type Supplier = {
  id: string;
  name: string;
  status: string;
  leadTimeDays: number | null;
  rating: number | null;
  _count?: { purchaseOrders: number };
};

export default function Suppliers() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  useNewHotkey(() => setCreateOpen(true));
  useOpenNewFromQuery(setCreateOpen);

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers', slug],
    queryFn: () => apiFetch<Supplier[]>(`/api/teams/${slug}/suppliers`),
    enabled: !!slug,
  });

  const columns = useMemo<AppColumnDef<Supplier>[]>(
    () => [
      { accessorKey: 'name', header: 'Name', size: 260 },
      {
        accessorKey: 'leadTimeDays',
        header: 'Lead time',
        size: 130,
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          return v ? `${v}d` : '—';
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 150,
        cell: ({ getValue }) => <Badge status={getValue<string>()} />,
      },
      { accessorFn: (s) => s._count?.purchaseOrders ?? 0, id: 'poCount', header: 'POs', size: 100 },
    ],
    []
  );

  return (
    <Layout title="Suppliers" icon={Truck} iconTone="rose">
      <div className="mb-4 flex justify-end">
        <NewButton onClick={() => setCreateOpen(true)} label="New supplier" />
      </div>

      <DataTable
        columns={columns}
        data={suppliers ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter suppliers…"
        emptyMessage="No suppliers yet"
        emptyDescription="Add a supplier so items can be replenished automatically when stock runs low."
        emptyIcon={Truck}
        getRowHref={(s) => `/teams/${slug}/suppliers/${s.id}`}
      />

      <SidebarModal open={createOpen} onClose={() => setCreateOpen(false)} title="New supplier">
        <SupplierForm
          slug={slug}
          onSuccess={(supplier) => {
            setCreateOpen(false);
            queryClient.invalidateQueries({ queryKey: ['suppliers', slug] });
            router.push(`/teams/${slug}/suppliers/${supplier.id}`);
          }}
        />
      </SidebarModal>
    </Layout>
  );
}
