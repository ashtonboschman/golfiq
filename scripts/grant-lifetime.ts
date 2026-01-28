/**
 * Script to manually grant lifetime access to a user
 * Usage: npx tsx scripts/grant-lifetime.ts <email> <granted_by> <reason>
 * Example: npx tsx scripts/grant-lifetime.ts user@example.com admin@example.com "Early supporter reward"
 */

import { prisma } from '../lib/db';

async function grantLifetimeAccess(
  email: string,
  grantedBy: string,
  reason: string
) {
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

    // Check if user already has lifetime access
    if (user.subscriptionTier === 'lifetime') {
      console.log(`⚠️  User already has lifetime access`);
      console.log(`   Existing grants: ${user.lifetimeGrants.length}`);

      const proceed = process.argv.includes('--force');
      if (!proceed) {
        console.log(`   Use --force to grant anyway`);
        process.exit(0);
      }
    }

    // Get user's previous subscription details
    const oldTier = user.subscriptionTier;
    const oldStatus = user.subscriptionStatus;

    console.log(`\n📝 Current subscription:`);
    console.log(`   Tier: ${oldTier}`);
    console.log(`   Status: ${oldStatus}`);

    // Cancel existing Stripe subscription if exists
    if (user.stripeSubscriptionId) {
      console.log(`\n⚠️  User has active Stripe subscription: ${user.stripeSubscriptionId}`);
      console.log(`   You may want to cancel it manually in Stripe Dashboard`);
    }

    // Grant lifetime access
    console.log(`\n🎁 Granting lifetime access...`);

    const result = await prisma.$transaction(async (tx) => {
      // Update user subscription
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: 'lifetime',
          subscriptionStatus: 'active',
          subscriptionStartsAt: new Date(),
          subscriptionEndsAt: null, // Lifetime never expires
        },
      });

      // Create lifetime grant record
      const grant = await tx.lifetimeGrant.create({
        data: {
          userId: user.id,
          grantedBy,
          reason,
        },
      });

      // Log subscription event
      const event = await tx.subscriptionEvent.create({
        data: {
          userId: user.id,
          eventType: 'lifetime_granted',
          oldTier,
          newTier: 'lifetime',
          oldStatus,
          newStatus: 'active',
          metadata: {
            grantedBy,
            reason,
            grantId: grant.id.toString(),
          },
        },
      });

      return { updatedUser, grant, event };
    });

    console.log(`\n✅ Lifetime access granted successfully!`);
    console.log(`   Grant ID: ${result.grant.id}`);
    console.log(`   Event ID: ${result.event.id}`);
    console.log(`   User tier: ${result.updatedUser.subscriptionTier}`);
    console.log(`   User status: ${result.updatedUser.subscriptionStatus}`);

    console.log(`\n📧 Consider sending a notification email to: ${email}`);
    console.log(`\n🎉 Done!`);

  } catch (error) {
    console.error(`\n❌ Error granting lifetime access:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length < 3) {
  console.log(`
Usage: npx tsx scripts/grant-lifetime.ts <email> <granted_by> <reason>

Arguments:
  email       - Email of the user to grant lifetime access
  granted_by  - Email or name of the person granting access
  reason      - Reason for granting lifetime access

Options:
  --force     - Grant even if user already has lifetime access

Example:
  npx tsx scripts/grant-lifetime.ts user@example.com admin@example.com "Early supporter reward"
  `);
  process.exit(1);
}

const [email, grantedBy, ...reasonParts] = args.filter(arg => !arg.startsWith('--'));
const reason = reasonParts.join(' ');

if (!email || !grantedBy || !reason) {
  console.error('❌ Missing required arguments');
  process.exit(1);
}

console.log(`
╔═══════════════════════════════════════════════════╗
║   LIFETIME ACCESS GRANT SCRIPT                    ║
╚═══════════════════════════════════════════════════╝

📋 Details:
   User: ${email}
   Granted by: ${grantedBy}
   Reason: ${reason}
`);

grantLifetimeAccess(email, grantedBy, reason);
