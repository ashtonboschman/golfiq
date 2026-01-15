import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    // Validate token
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { type: 'error', message: 'Invalid or missing verification token.' },
        { status: 400 }
      );
    }

    // Find the token
    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return NextResponse.json(
        { type: 'error', message: 'Invalid or expired verification token.' },
        { status: 400 }
      );
    }

    // Check if token has already been used
    if (verificationToken.usedAt) {
      return NextResponse.json(
        { type: 'error', message: 'This verification link has already been used.' },
        { status: 400 }
      );
    }

    // Check if token has expired
    if (new Date() > verificationToken.expiresAt) {
      return NextResponse.json(
        { type: 'error', message: 'This verification link has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: verificationToken.email },
    });

    if (!user) {
      return NextResponse.json(
        { type: 'error', message: 'User not found.' },
        { status: 404 }
      );
    }

    // Update user's email verification status and mark token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      }),
      prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({
      type: 'success',
      message: 'Your email has been verified successfully!',
    });
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json(
      { type: 'error', message: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
