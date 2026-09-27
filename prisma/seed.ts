import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../lib/auth';

const prisma = new PrismaClient();

async function main() {
  const owner = await prisma.user.upsert({
    where: { email: 'owner@example.com' },
    create: { name: 'Sam Owner', email: 'owner@example.com', password: await hashPassword('password123') },
    update: {},
  });

  const team = await prisma.team.upsert({
    where: { slug: 'demo' },
    create: { name: 'Demo Inventory Co', slug: 'demo' },
    update: {},
  });

  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: owner.id } },
    create: { teamId: team.id, userId: owner.id, role: Role.OWNER },
    update: { role: Role.OWNER },
  });

  await prisma.agentPolicy.upsert({
    where: { teamId: team.id },
    create: { teamId: team.id, autoReorderEnabled: true, autoReorderMaxAmount: 1000 },
    update: {},
  });

  const warehouse = await prisma.warehouse.upsert({
    where: { teamId_name: { teamId: team.id, name: 'Main Warehouse' } },
    create: { teamId: team.id, name: 'Main Warehouse', code: 'MAIN', isDefault: true, city: 'Austin', country: 'USA' },
    update: {},
  });

  const supplier = await prisma.supplier.upsert({
    where: { teamId_name: { teamId: team.id, name: 'Acme Supply Co' } },
    create: { teamId: team.id, name: 'Acme Supply Co', createdById: owner.id, email: 'sales@acme-supply.example', leadTimeDays: 5 },
    update: {},
  });

  const item = await prisma.item.upsert({
    where: { teamId_sku: { teamId: team.id, sku: 'WIDGET-001' } },
    create: {
      teamId: team.id,
      sku: 'WIDGET-001',
      name: 'Blue Widget',
      unitOfMeasure: 'unit',
      costPrice: 4.5,
      sellPrice: 12,
      reorderPoint: 20,
      reorderQty: 100,
      createdById: owner.id,
      preferredSupplierId: supplier.id,
    },
    update: {},
  });

  await prisma.stockLevel.upsert({
    where: { itemId_warehouseId: { itemId: item.id, warehouseId: warehouse.id } },
    create: { teamId: team.id, itemId: item.id, warehouseId: warehouse.id, onHand: 15 },
    update: {},
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded team "${team.slug}" — sign in as owner@example.com / password123`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
