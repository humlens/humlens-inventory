// The Humlens apps and where they live: safe for the browser (the app
// switcher uses it). The ticket signing that goes with it is in lib/sso.ts,
// which is server-only because it needs Node's crypto.

export type HumlensApp = 'inventory' | 'procurement' | 'commerce';

export const THIS_APP: HumlensApp = 'inventory';

export const APP_LABELS: Record<HumlensApp, string> = {
  inventory: 'Inventory',
  procurement: 'Procurement',
  commerce: 'Store admin',
};

export const appUrls: Record<HumlensApp, string | undefined> = {
  inventory: process.env.NEXT_PUBLIC_HUMLENS_INVENTORY_URL,
  procurement: process.env.NEXT_PUBLIC_HUMLENS_PROCUREMENT_URL,
  commerce: process.env.NEXT_PUBLIC_HUMLENS_COMMERCE_URL,
};
