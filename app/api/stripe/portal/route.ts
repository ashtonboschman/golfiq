import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { createBillingPortalSession } from '@/lib/stripe';

/**
 * POST /api/stripe/portal
 * Create a Stripe billing portal session for subscription management
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Check if user has Stripe customer ID
    if (!user.stripeCustomerId) {
      return NextResponse.json(
        { message: 'No subscription found' },
        { status: 400 }
      );
    }

    // Create billing portal session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const portalSession = await createBillingPortalSession({
      customerId: user.stripeCustomerId,
      returnUrl: `${appUrl}/settings`,
    });

    return NextResponse.json({
      url: portalSession.url,
    });
  } catch (error: any) {
    console.error('Billing portal error:', error);
    return NextResponse.json(
      { message: error.message || 'Error creating billing portal session' },
      { status: 500 }
    );
  }
}
