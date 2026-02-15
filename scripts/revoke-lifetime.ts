/**
 * Script to revoke lifetime access from a user
 * Usage: npx tsx scripts/revoke-lifetime.ts <email> <reason>
 * Example: npx tsx scripts/revoke-lifetime.ts user@example.com "Policy violation"
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function revokeLifetimeAccess(email: string, reason: string) {
  try {
    console.log(`\n🔍 Looking up user: ${email}`);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: { lifetimeGrants: true },
    });

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.username} (ID: ${user.id})`);

    // Check if user has lifetime access
    if (user.subscriptionTier !== 'lifetime') {
      console.log(`⚠️  User does not have lifetime access`);
      console.log(`   Current tier: ${user.subscriptionTier}`);
      process.exit(0);
    }

    console.log(`\n📝 Current subscription:`);
    console.log(`   Tier: ${user.subscriptionTier}`);
    console.log(`   Status: ${user.subscriptionStatus}`);
    console.log(`   Lifetime grants: ${user.lifetimeGrants.length}`);

    // Display grants
    if (user.lifetimeGrants.length > 0) {
      console.log(`\n📋 Existing grants:`);
      user.lifetimeGrants.forEach((grant) => {
        console.log(`   - Grant ID: ${grant.id}`);
        console.log(`     Granted by: ${grant.grantedBy}`);
        console.log(`     Reason: ${grant.reason}`);
        console.log(`     Date: ${grant.createdAt.toLocaleDateString()}`);
      });
    }

    // Revoke lifetime access
    console.log(`\n🚫 Revoking lifetime access...`);

    const result = await prisma.$transaction(async (tx) => {
      // Update user subscription to free
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: 'free',
          subscriptionStatus: 'active',
          subscriptionEndsAt: null,
          subscriptionCancelAtPeriodEnd: false,
        },
      });

      // Log subscription event
      const event = await tx.subscriptionEvent.create({
        data: {
          userId: user.id,
          eventType: 'lifetime_revoked',
          oldTier: 'lifetime',
          newTier: 'free',
          oldStatus: user.subscriptionStatus,
          newStatus: 'active',
          metadata: {
            reason,
            grantIds: user.lifetimeGrants.map((g) => g.id.toString()),
          },
        },
      });

      // Note: We don't delete grant records - they serve as audit trail
      // They will just no longer be active

      return { updatedUser, event };
    });

    console.log(`\n✅ Lifetime access revoked successfully!`);
    console.log(`   Event ID: ${result.event.id}`);
    console.log(`   User tier: ${result.updatedUser.subscriptionTier}`);
    console.log(`   User status: ${result.updatedUser.subscriptionStatus}`);

    console.log(`\n⚠️  Note: Grant records are preserved for audit trail`);
    console.log(`📧 Consider sending a notification email to: ${email}`);
    console.log(`\n✅ Done!`);

  } catch (error) {
    console.error(`\n❌ Error revoking lifetime access:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`
Usage: npx tsx scripts/revoke-lifetime.ts <email> <reason>

Arguments:
  email   - Email of the user to revoke lifetime access from
  reason  - Reason for revoking lifetime access

Example:
  npx tsx scripts/revoke-lifetime.ts user@example.com "Policy violation"
  `);
  process.exit(1);
}

const [email, ...reasonParts] = args;
const reason = reasonParts.join(' ');

if (!email || !reason) {
  console.error('❌ Missing required arguments');
  process.exit(1);
}

console.log(`
╔═══════════════════════════════════════════════════╗
║   LIFETIME ACCESS REVOCATION SCRIPT               ║
╚═══════════════════════════════════════════════════╝

📋 Details:
   User: ${email}
   Reason: ${reason}

⚠️  WARNING: This will revoke lifetime access!
`);

revokeLifetimeAccess(email, reason);
