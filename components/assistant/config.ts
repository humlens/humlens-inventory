import type { AssistantConfig } from './AssistantPanel';

// What the assistant offers in Humlens Inventory. The tools themselves are in lib/assistant/tools.ts.
export const assistantConfig: AssistantConfig = {
  tagline: 'Stock, sales, suppliers and orders',
  suggestions: [
    'What should I reorder this week?',
    'Which items will run out in the next two weeks?',
    'What needs my attention in the inbox?',
    'Which items have not sold in the last 90 days?',
  ],
  toolLabels: {
    search_items: 'Looking up items',
    get_item: 'Reading the item',
    get_demand: 'Checking sales and stock runway',
    get_stock_levels: 'Checking stock levels',
    list_stock_movements: 'Reading stock movements',
    list_warehouses: 'Looking up warehouses',
    list_suppliers: 'Looking up suppliers',
    list_purchase_orders: 'Looking up purchase orders',
    get_agent_inbox: 'Reading the inbox',
    show_inbox_item: 'Opening the inbox item',
    propose_stock_movement: 'Preparing the stock movement',
    propose_reorder_levels: 'Preparing new reorder levels',
    propose_purchase_order: 'Preparing the purchase order',
    run_reorder_check: 'Running the reorder agent',
  },
};
