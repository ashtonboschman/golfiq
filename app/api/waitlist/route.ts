import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendEmail, generateWaitlistConfirmationEmail } from '@/lib/email';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { email, name, handicap } = await req.json();

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 }
      );
    }

    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if email already exists in waitlist
    const existing = await prisma.waitlist.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Email already registered on waitlist' },
        { status: 409 }
      );
    }

    // Generate confirmation token
    const confirmationToken = crypto.randomBytes(32).toString('hex');

    // Insert into waitlist
    const waitlistEntry = await prisma.waitlist.create({
      data: {
        email: email.toLowerCase(),
        name: name || null,
        handicap: handicap || null,
        confirmationToken,
        confirmed: false,
        metadata: {
          user_agent: req.headers.get('user-agent') || 'unknown',
          ip: req.headers.get('x-forwarded-for') || 'unknown',
        },
      },
    });

    // Send confirmation email
    const confirmationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/waitlist-confirm?token=${confirmationToken}`;

    try {
      const { subject, html, text } = generateWaitlistConfirmationEmail({
        name: name || 'Golfer',
        confirmationUrl,
      });

      await sendEmail({
        to: email,
        subject,
        html,
        text,
      });
    } catch (emailError) {
      console.error('Error sending confirmation email:', emailError);
      // Don't fail the request if email fails
      // Entry is still in waitlist, just not confirmed
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully added to waitlist! Check your email to confirm.',
      waitlist_id: waitlistEntry.id.toString(),
    });
  } catch (error) {
    console.error('Waitlist signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve waitlist stats (public)
export async function GET() {
  try {
    const count = await prisma.waitlist.count();

    return NextResponse.json({
      count,
    });
  } catch (error) {
    console.error('Waitlist stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
