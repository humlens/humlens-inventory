import { useMemo } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import { apiFetch } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type Transaction = {
  id: string;
  type: string;
  quantity: number;
  createdAt: string;
  reference: string | null;
  item: { sku: string; name: string };
  warehouse: { name: string };
  performedBy: { name: string };
};

export default function StockTransactions() {
  const router = useRouter();
  const slug = router.query.slug as string;

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['stock-transactions', slug],
    queryFn: () => apiFetch<Transaction[]>(`/api/teams/${slug}/stock-transactions`),
    enabled: !!slug,
  });

  const columns = useMemo<AppColumnDef<Transaction>[]>(
    () => [
      { accessorFn: (t) => `${t.item.sku} ${t.item.name}`, id: 'item', header: 'Item', size: 260 },
      { accessorFn: (t) => t.warehouse.name, id: 'warehouse', header: 'Warehouse', size: 180 },
      { accessorKey: 'type', header: 'Type', size: 160, cell: ({ getValue }) => <Badge status={getValue<string>()} /> },
      { accessorKey: 'quantity', header: 'Qty', size: 100 },
      { accessorFn: (t) => t.performedBy.name, id: 'performedBy', header: 'By', size: 160 },
      {
        accessorKey: 'createdAt',
        header: 'When',
        size: 180,
        cell: ({ getValue }) => new Date(getValue<string>()).toLocaleString(),
      },
    ],
    []
  );

  return (
    <Layout title="Stock Movement History">
      <DataTable
        columns={columns}
        data={transactions ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter movement history…"
        emptyMessage="No stock movement yet"
        emptyDescription="Every receipt, issue, transfer, and adjustment will show up here as it happens."
        emptyIcon={History}
      />
    </Layout>
  );
}
