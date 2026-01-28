/**
 * Script to list all users with lifetime access
 * Usage: npx tsx scripts/list-lifetime.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listLifetimeUsers() {
  try {
    console.log(`\n🔍 Fetching users with lifetime access...`);

    const users = await prisma.user.findMany({
      where: {
        subscriptionTier: 'lifetime',
      },
      include: {
        lifetimeGrants: true,
        profile: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (users.length === 0) {
      console.log(`\n📭 No users with lifetime access found`);
      return;
    }

    console.log(`\n✅ Found ${users.length} user(s) with lifetime access:\n`);
    console.log('═'.repeat(80));

    users.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.username} (${user.email})`);
      console.log(`   User ID: ${user.id}`);
      console.log(`   Status: ${user.subscriptionStatus}`);
      console.log(`   Member since: ${user.createdAt.toLocaleDateString()}`);

      if (user.profile) {
        const name = [user.profile.firstName, user.profile.lastName]
          .filter(Boolean)
          .join(' ');
        if (name) {
          console.log(`   Name: ${name}`);
        }
      }

      if (user.subscriptionStartDate) {
        console.log(`   Lifetime granted: ${user.subscriptionStartDate.toLocaleDateString()}`);
      }

      if (user.lifetimeGrants.length > 0) {
        console.log(`\n   📋 Grants (${user.lifetimeGrants.length}):`);
        user.lifetimeGrants.forEach((grant) => {
          console.log(`      - Grant ID: ${grant.id}`);
          console.log(`        Granted by: ${grant.grantedBy}`);
          console.log(`        Reason: ${grant.reason}`);
          console.log(`        Date: ${grant.createdAt.toLocaleDateString()}`);
        });
      } else {
        console.log(`\n   ⚠️  No grant records found (possible data migration)`);
      }

      console.log('─'.repeat(80));
    });

    console.log(`\n📊 Summary:`);
    console.log(`   Total lifetime users: ${users.length}`);
    console.log(`   Active: ${users.filter(u => u.subscriptionStatus === 'active').length}`);
    console.log(`   Total grants: ${users.reduce((sum, u) => sum + u.lifetimeGrants.length, 0)}`);

  } catch (error) {
    console.error(`\n❌ Error listing lifetime users:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

console.log(`
╔═══════════════════════════════════════════════════╗
║   LIFETIME ACCESS USERS LIST                      ║
╚═══════════════════════════════════════════════════╝
`);

listLifetimeUsers();
