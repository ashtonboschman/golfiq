import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { prisma } from '@/lib/db';
import { sendEmail, generateEmailVerificationEmail, EMAIL_FROM } from '@/lib/email';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { type: 'error', message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: BigInt(session.user.id) },
      include: {
        profile: {
          select: {
            firstName: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { type: 'error', message: 'User not found.' },
        { status: 404 }
      );
    }

    // Check if already verified
    if (user.emailVerified) {
      return NextResponse.json(
        { type: 'error', message: 'Your email is already verified!' },
        { status: 400 }
      );
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    // Delete any existing unused tokens for this email
    await prisma.emailVerificationToken.deleteMany({
      where: {
        email: user.email,
        usedAt: null,
      },
    });

    // Create new verification token
    await prisma.emailVerificationToken.create({
      data: {
        email: user.email,
        token: verificationToken,
        expiresAt,
      },
    });

    // Send verification email
    const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
    const { subject, html, text } = generateEmailVerificationEmail(
      verifyUrl,
      user.profile?.firstName || undefined
    );

    const emailSent = await sendEmail({
      to: user.email,
      subject,
      html,
      text,
      from: EMAIL_FROM.NOREPLY, // Email verification from noreply
    });

    if (!emailSent) {
      console.error('Failed to send verification email to:', user.email);
      return NextResponse.json(
        { type: 'error', message: 'Failed to send verification email. Please try again later.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      type: 'success',
      message: 'Verification email sent! Please check your inbox.',
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json(
      { type: 'error', message: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
