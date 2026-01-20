import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(new URL('/?error=invalid_token', req.url));
    }

    // Find waitlist entry by confirmation token
    const waitlistEntry = await prisma.waitlist.findUnique({
      where: { confirmationToken: token },
    });

    if (!waitlistEntry) {
      return NextResponse.redirect(new URL('/?error=invalid_token', req.url));
    }

    // Check if already confirmed
    if (waitlistEntry.confirmed) {
      return NextResponse.redirect(new URL('/?already_confirmed=true', req.url));
    }

    // Update to confirmed and clear token
    await prisma.waitlist.update({
      where: { id: waitlistEntry.id },
      data: {
        confirmed: true,
        confirmationToken: null,
      },
    });

    // Redirect to landing page with success message
    return NextResponse.redirect(new URL('/?confirmed=true', req.url));
  } catch (error) {
    console.error('Confirmation error:', error);
    return NextResponse.redirect(new URL('/?error=server_error', req.url));
  }
}

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { type: 'error', message: 'Confirmation token is required' },
        { status: 400 }
      );
    }

    // Find waitlist entry with this token
    const waitlistEntry = await prisma.waitlist.findUnique({
      where: { confirmationToken: token },
    });

    if (!waitlistEntry) {
      return NextResponse.json(
        { type: 'error', message: 'Invalid or expired confirmation link' },
        { status: 404 }
      );
    }

    // Check if already confirmed
    if (waitlistEntry.confirmed) {
      return NextResponse.json(
        { type: 'success', message: 'Your email is already confirmed!' },
        { status: 200 }
      );
    }

    // Confirm the waitlist entry and clear the token
    await prisma.waitlist.update({
      where: { id: waitlistEntry.id },
      data: {
        confirmed: true,
        confirmationToken: null,
      },
    });

    return NextResponse.json({
      type: 'success',
      message: "You're confirmed! We'll notify you when GolfIQ launches.",
    });
  } catch (error) {
    console.error('Waitlist confirmation error:', error);
    return NextResponse.json(
      { type: 'error', message: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
