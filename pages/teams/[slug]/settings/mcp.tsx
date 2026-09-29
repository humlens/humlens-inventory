import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';

import SettingsLayout from '@/components/settings/SettingsLayout';
import { settingsTabs } from '@/components/settings/tabs';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function McpSettings({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const slug = router.query.slug as string;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4200';

  const config = JSON.stringify(
    {
      mcpServers: {
        inventory: {
          url: `${appUrl}/api/mcp`,
          headers: { Authorization: 'Bearer <your API key>' },
        },
      },
    },
    null,
    2
  );

  return (
    <SettingsLayout
      tabs={settingsTabs}
      active="mcp"
      description="Let Claude or any MCP-compatible agent look up stock levels, record stock movement, create purchase orders, and more — on your behalf, subject to your role's permissions."
    >
      <div className="card max-w-2xl space-y-4">
        <div>
          <p className="label">Endpoint</p>
          <code className="block rounded-md bg-gray-100 px-3 py-2 text-sm">{appUrl}/api/mcp</code>
        </div>
        <div>
          <p className="label">Authentication</p>
          <p className="text-sm text-gray-600">
            Bearer token: an API key from{' '}
            <Link href={`/teams/${slug}/settings/api-keys`} className="text-indigo-600 hover:underline">
              API keys
            </Link>
            . Tool calls take your team slug (<code className="rounded bg-gray-100 px-1">{slug}</code>) plus{' '}
            <code className="rounded bg-gray-100 px-1">actingUserEmail</code> (
            <code className="rounded bg-gray-100 px-1">{userEmail}</code>); a key only works for this team and acts as
            the member who created it, with their role&apos;s permissions. Operators can instead use the deployment&apos;s{' '}
            <code className="rounded bg-gray-100 px-1">MCP_SERVER_TOKEN</code>, which can act for any team.
          </p>
        </div>
        <div>
          <p className="label">Example client config</p>
          <pre className="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">{config}</pre>
        </div>
      </div>
    </SettingsLayout>
  );
}
