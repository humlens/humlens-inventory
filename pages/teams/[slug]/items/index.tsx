import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Package } from 'lucide-react';

import Layout from '@/components/Layout';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import NewButton from '@/components/NewButton';
import SidebarModal from '@/components/SidebarModal';
import ItemForm from '@/components/forms/ItemForm';
import { apiFetch } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';
import { useNewHotkey } from '@/lib/useNewHotkey';
import { useOpenNewFromQuery } from '@/lib/useOpenNewFromQuery';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type Item = {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
  costPrice: string | number;
  reorderPoint: number;
  category?: { name: string } | null;
  stockLevels: { onHand: number }[];
};

export default function Items() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  useNewHotkey(() => setCreateOpen(true));
  useOpenNewFromQuery(setCreateOpen);

  const { data: items, isLoading } = useQuery({
    queryKey: ['items', slug],
    queryFn: () => apiFetch<Item[]>(`/api/teams/${slug}/items`),
    enabled: !!slug,
  });

  const columns = useMemo<AppColumnDef<Item>[]>(
    () => [
      { accessorKey: 'sku', header: 'SKU', size: 140 },
      { accessorKey: 'name', header: 'Name', size: 280 },
      { accessorFn: (i) => i.category?.name ?? '—', id: 'category', header: 'Category', size: 160 },
      {
        accessorFn: (i) => i.stockLevels.reduce((sum, l) => sum + l.onHand, 0),
        id: 'onHand',
        header: 'On hand',
        size: 120,
        cell: ({ row }) => {
          const onHand = row.original.stockLevels.reduce((sum, l) => sum + l.onHand, 0);
          const low = onHand <= row.original.reorderPoint;
          return <span className={low ? 'font-medium text-amber-600' : ''}>{onHand}</span>;
        },
      },
      {
        accessorKey: 'costPrice',
        header: 'Cost',
        size: 120,
        cell: ({ getValue }) => `$${Number(getValue<string | number>()).toFixed(2)}`,
      },
    ],
    []
  );

  return (
    <Layout title="Items" icon={Package} iconTone="blue">
      <div className="mb-4 flex justify-end">
        <NewButton onClick={() => setCreateOpen(true)} label="New item" />
      </div>

      <DataTable
        columns={columns}
        data={items ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter items…"
        emptyMessage="No items yet"
        emptyDescription="Add your first catalog item to start tracking stock across warehouses."
        emptyIcon={Package}
        getRowHref={(i) => `/teams/${slug}/items/${i.id}`}
      />

      <SidebarModal open={createOpen} onClose={() => setCreateOpen(false)} title="New item">
        <ItemForm
          slug={slug}
          onSuccess={(item) => {
            setCreateOpen(false);
            queryClient.invalidateQueries({ queryKey: ['items', slug] });
            router.push(`/teams/${slug}/items/${item.id}`);
          }}
        />
      </SidebarModal>
    </Layout>
  );
}
