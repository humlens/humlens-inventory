// Type-only: this file runs in the browser too (pages use it to show or hide
// actions), and a value import would bundle Prisma's browser runtime.
import type { Role } from '@prisma/client';

type RoleType = Role;

export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'issue'
  | 'receive'
  | 'transfer'
  | 'adjust'
  | 'count'
  | 'configure'
  | 'invite'
  | 'leave';

export type Resource =
  | 'team'
  | 'team_member'
  | 'team_invitation'
  | 'warehouse'
  | 'category'
  | 'item'
  | 'stock_level'
  | 'stock_transaction'
  | 'supplier'
  | 'purchase_order'
  | 'goods_receipt'
  | 'stock_transfer'
  | 'stock_adjustment'
  | 'cycle_count'
  | 'agent_policy'
  | 'agent_action'
  | 'audit_log';

export type Permission = {
  resource: Resource;
  actions: Action[] | '*';
};

type RolePermissions = {
  [role in RoleType]: Permission[];
};

export const availableRoles: { id: RoleType; name: string; description: string }[] = [
  { id: 'OWNER', name: 'Owner', description: 'Full control, billing, and team management' },
  { id: 'ADMIN', name: 'Admin', description: 'Configures warehouses, catalog, policy, and approvals' },
  { id: 'WAREHOUSE_MANAGER', name: 'Warehouse Manager', description: 'Runs receiving, transfers, adjustments, and cycle counts' },
  { id: 'PROCUREMENT', name: 'Procurement', description: 'Manages suppliers and purchase orders' },
  { id: 'STAFF', name: 'Staff', description: 'Records day-to-day stock movement' },
  { id: 'AUDITOR', name: 'Auditor', description: 'Read-only access across the tenant for compliance review' },
];

export const permissions: RolePermissions = {
  OWNER: [
    { resource: 'team', actions: '*' },
    { resource: 'team_member', actions: '*' },
    { resource: 'team_invitation', actions: '*' },
    { resource: 'warehouse', actions: '*' },
    { resource: 'category', actions: '*' },
    { resource: 'item', actions: '*' },
    { resource: 'stock_level', actions: '*' },
    { resource: 'stock_transaction', actions: '*' },
    { resource: 'supplier', actions: '*' },
    { resource: 'purchase_order', actions: '*' },
    { resource: 'goods_receipt', actions: '*' },
    { resource: 'stock_transfer', actions: '*' },
    { resource: 'stock_adjustment', actions: '*' },
    { resource: 'cycle_count', actions: '*' },
    { resource: 'agent_policy', actions: '*' },
    { resource: 'agent_action', actions: '*' },
    { resource: 'audit_log', actions: ['read'] },
  ],
  ADMIN: [
    { resource: 'team', actions: ['read', 'update'] },
    { resource: 'team_member', actions: '*' },
    { resource: 'team_invitation', actions: '*' },
    { resource: 'warehouse', actions: '*' },
    { resource: 'category', actions: '*' },
    { resource: 'item', actions: '*' },
    { resource: 'stock_level', actions: ['read'] },
    { resource: 'stock_transaction', actions: '*' },
    { resource: 'supplier', actions: '*' },
    { resource: 'purchase_order', actions: '*' },
    { resource: 'goods_receipt', actions: ['read', 'create', 'update'] },
    { resource: 'stock_transfer', actions: '*' },
    { resource: 'stock_adjustment', actions: '*' },
    { resource: 'cycle_count', actions: '*' },
    { resource: 'agent_policy', actions: '*' },
    { resource: 'agent_action', actions: ['read', 'approve', 'reject'] },
    { resource: 'audit_log', actions: ['read'] },
  ],
  WAREHOUSE_MANAGER: [
    { resource: 'team', actions: ['read', 'leave'] },
    { resource: 'warehouse', actions: ['read', 'update'] },
    { resource: 'category', actions: ['read'] },
    { resource: 'item', actions: ['read', 'update'] },
    { resource: 'stock_level', actions: ['read'] },
    { resource: 'stock_transaction', actions: ['create', 'read'] },
    { resource: 'goods_receipt', actions: ['create', 'read', 'update'] },
    { resource: 'stock_transfer', actions: ['create', 'read', 'transfer'] },
    { resource: 'stock_adjustment', actions: ['create', 'read', 'adjust'] },
    { resource: 'cycle_count', actions: ['create', 'read', 'update', 'count'] },
    { resource: 'agent_action', actions: ['read', 'approve', 'reject'] },
  ],
  PROCUREMENT: [
    { resource: 'team', actions: ['read', 'leave'] },
    { resource: 'warehouse', actions: ['read'] },
    { resource: 'category', actions: ['read'] },
    { resource: 'item', actions: ['read', 'create', 'update'] },
    { resource: 'stock_level', actions: ['read'] },
    { resource: 'supplier', actions: '*' },
    { resource: 'purchase_order', actions: ['create', 'read', 'update', 'approve', 'issue'] },
    { resource: 'goods_receipt', actions: ['read'] },
    { resource: 'agent_action', actions: ['read'] },
  ],
  STAFF: [
    { resource: 'team', actions: ['read', 'leave'] },
    { resource: 'warehouse', actions: ['read'] },
    { resource: 'category', actions: ['read'] },
    { resource: 'item', actions: ['read'] },
    { resource: 'stock_level', actions: ['read'] },
    { resource: 'stock_transaction', actions: ['create', 'read'] },
    { resource: 'goods_receipt', actions: ['create', 'read'] },
    { resource: 'stock_transfer', actions: ['create', 'read'] },
    { resource: 'stock_adjustment', actions: ['create', 'read'] },
    { resource: 'cycle_count', actions: ['read', 'count'] },
  ],
  AUDITOR: [
    { resource: 'team', actions: ['read'] },
    { resource: 'warehouse', actions: ['read'] },
    { resource: 'category', actions: ['read'] },
    { resource: 'item', actions: ['read'] },
    { resource: 'stock_level', actions: ['read'] },
    { resource: 'stock_transaction', actions: ['read'] },
    { resource: 'supplier', actions: ['read'] },
    { resource: 'purchase_order', actions: ['read'] },
    { resource: 'goods_receipt', actions: ['read'] },
    { resource: 'stock_transfer', actions: ['read'] },
    { resource: 'stock_adjustment', actions: ['read'] },
    { resource: 'cycle_count', actions: ['read'] },
    { resource: 'agent_action', actions: ['read'] },
    { resource: 'audit_log', actions: ['read'] },
  ],
};

export function can(role: RoleType, resource: Resource, action: Action): boolean {
  const rolePermissions = permissions[role] || [];
  const match = rolePermissions.find((p) => p.resource === resource);
  if (!match) return false;
  return match.actions === '*' || match.actions.includes(action);
}

export function getRoleDisplayName(role: RoleType): string {
  return availableRoles.find((r) => r.id === role)?.name || role;
}
