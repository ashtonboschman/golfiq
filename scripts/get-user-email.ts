import { prisma } from '../lib/db';

async function getUserEmail(id: number) {
  const user = await prisma.user.findUnique({ where: { id } });
  console.log(user?.email || 'Not found');
  await prisma.$disconnect();
}

getUserEmail(1);
