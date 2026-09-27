import { useMemo } from 'react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';

import Layout from '@/components/Layout';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import { apiFetch } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type StockLevel = {
  id: string;
  onHand: number;
  reserved: number;
  item: { name: string; sku: string; reorderPoint: number };
  warehouse: { name: string };
};

export default function StockLevels() {
  const router = useRouter();
  const slug = router.query.slug as string;

  const { data: levels, isLoading } = useQuery({
    queryKey: ['stock-levels', slug, 'all'],
    queryFn: () => apiFetch<StockLevel[]>(`/api/teams/${slug}/stock-levels`),
    enabled: !!slug,
  });

  const columns = useMemo<AppColumnDef<StockLevel>[]>(
    () => [
      { accessorFn: (l) => l.item.sku, id: 'sku', header: 'SKU', size: 140 },
      { accessorFn: (l) => l.item.name, id: 'name', header: 'Item', size: 260 },
      { accessorFn: (l) => l.warehouse.name, id: 'warehouse', header: 'Warehouse', size: 200 },
      {
        accessorKey: 'onHand',
        header: 'On hand',
        size: 130,
        cell: ({ row }) => {
          const low = row.original.onHand <= row.original.item.reorderPoint;
          return <span className={low ? 'font-medium text-amber-600' : ''}>{row.original.onHand}</span>;
        },
      },
      { accessorKey: 'reserved', header: 'Reserved', size: 120 },
      {
        // What a connected store can sell: on hand minus what's held for checkouts in progress.
        id: 'available',
        accessorFn: (l) => Math.max(0, l.onHand - l.reserved),
        header: 'Available',
        size: 120,
        cell: ({ getValue }) => {
          const available = getValue<number>();
          return <span className={available === 0 ? 'font-medium text-amber-600' : ''}>{available}</span>;
        },
      },
    ],
    []
  );

  return (
    <Layout title="Stock Levels" icon={ClipboardList} iconTone="emerald">
      <div className="mb-4 flex justify-end gap-2">
        <Link href={`/teams/${slug}/stock-levels/transactions`} className="btn-secondary">
          View full history
        </Link>
        <Link href={`/teams/${slug}/stock-levels/record`} className="btn-primary">
          Record movement
        </Link>
      </div>

      <DataTable
        columns={columns}
        data={levels ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter stock levels…"
        emptyMessage="No stock recorded yet"
        emptyDescription="Receive a purchase order or record a movement to see stock levels here."
        emptyIcon={ClipboardList}
      />
    </Layout>
  );
}
