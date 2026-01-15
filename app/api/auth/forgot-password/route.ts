import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendEmail, generatePasswordResetEmail } from '@/lib/email';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { type: 'error', message: 'Email is required.' },
        { status: 400 }
      );
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    // Even if user doesn't exist, we return success
    if (!user) {
      return NextResponse.json({
        type: 'success',
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    }

    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Delete any existing unused tokens for this email
    await prisma.passwordResetToken.deleteMany({
      where: {
        email: user.email,
        usedAt: null,
      },
    });

    // Create new token
    await prisma.passwordResetToken.create({
      data: {
        email: user.email,
        token,
        expiresAt,
      },
    });

    // Generate reset URL
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    // Send email
    const { subject, html, text } = generatePasswordResetEmail(resetUrl);
    const emailSent = await sendEmail({
      to: user.email,
      subject,
      html,
      text,
    });

    if (!emailSent) {
      console.error('Failed to send password reset email to:', user.email);
      // Still return success to prevent email enumeration
    }

    return NextResponse.json({
      type: 'success',
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { type: 'error', message: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
