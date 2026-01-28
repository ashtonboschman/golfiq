require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function grantLifetimeSubscription(userId) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, first_name: true, last_name: true },
    });

    if (!user) {
      console.error(`User with ID ${userId} not found`);
      process.exit(1);
    }

    console.log(`Granting lifetime subscription to: ${user.first_name} ${user.last_name} (${user.email})`);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: 'lifetime',
        subscriptionStatus: 'active',
        subscriptionStartsAt: new Date(),
        subscriptionEndsAt: null,
        trialEndsAt: null,
      },
    });

    console.log('✓ Lifetime subscription granted successfully!');
    console.log(`  Tier: ${updatedUser.subscriptionTier}`);
    console.log(`  Status: ${updatedUser.subscriptionStatus}`);
    console.log(`  Start Date: ${updatedUser.subscriptionStartsAt}`);
  } catch (error) {
    console.error('Error granting lifetime subscription:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const userId = parseInt(process.argv[2]);

if (!userId || isNaN(userId)) {
  console.error('Usage: node scripts/grantLifetimeSubscription.js <user_id>');
  process.exit(1);
}

grantLifetimeSubscription(userId);
