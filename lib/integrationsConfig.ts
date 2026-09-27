import type { ConnectionKind } from '@prisma/client';

import type { ConnectionOptions } from '@/lib/connections';

// What Settings → Integrations offers in this app: the app it can connect to,
// and that connection's switches. (The same page ships in Procurement with
// its own config.)
export type ToggleOption = { key: keyof ConnectionOptions; label: string; description: string; default: boolean; requires?: keyof ConnectionOptions };

export const integrationsConfig: {
  thisApp: string;
  target: Exclude<ConnectionKind, 'COMMERCE'>;
  targetName: string;
  keyPrefix: string;
  keyHelp: string;
  toggles: ToggleOption[];
} = {
  thisApp: 'Humlens Inventory',
  target: 'PROCUREMENT',
  targetName: 'Humlens Procurement',
  keyPrefix: 'hprc_',
  keyHelp: 'Create one in Humlens Procurement under Settings → API keys, as an admin or owner.',
  toggles: [
    {
      key: 'routeReorders',
      label: 'Send low-stock reorders to Procurement',
      description:
        'The reorder agent raises one purchase request in Procurement (where approvals, budgets and vendors live) instead of drafting purchase orders here. Connected stores stop raising their own requests.',
      default: true,
    },
    {
      key: 'submitForApproval',
      label: 'Submit them for approval straight away',
      description: 'Otherwise requests arrive as drafts for someone to check and submit.',
      default: false,
      requires: 'routeReorders',
    },
  ],
};
