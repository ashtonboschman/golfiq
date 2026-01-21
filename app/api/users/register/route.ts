import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { errorResponse, successResponse } from '@/lib/api-auth';
import { sendEmail, generateEmailVerificationEmail, EMAIL_FROM } from '@/lib/email';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').toLowerCase(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .max(100, 'Password is too long'),
  first_name: z.string()
    .trim()
    .min(1, 'First name is required')
    .max(50, 'First name is too long'),
  last_name: z.string()
    .trim()
    .min(1, 'Last name is required')
    .max(50, 'Last name is too long'),
});

export async function POST(request: NextRequest) {
  try {
    // Parse request body safely
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    if (!body || typeof body !== 'object') {
      return errorResponse('Request body must be an object', 400);
    }

    // Validate input
    const result = registerSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error?.issues?.[0];
      const message = firstError?.message || 'Invalid request data';
      return errorResponse(message, 400);
    }

    const { email, password, first_name, last_name } = result.data;

    // Check if registration is open or email is in allowlist (beta access)
    try {
      console.log('[REGISTER] Checking waitlist models...');
      console.log('[REGISTER] prisma object keys:', Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$')).slice(0, 5));

      // Try to access the models - if they don't exist, this will throw
      const hasWaitlistModels = 'featureFlag' in prisma && 'allowedEmail' in prisma;
      console.log('[REGISTER] Has waitlist models:', hasWaitlistModels);

      if (!hasWaitlistModels) {
        console.warn('[REGISTER] Waitlist models not available yet, allowing registration');
      } else {
        console.log('[REGISTER] Checking feature flag...');
        // Check feature flag for open registration
        const flagData = await (prisma as any).featureFlag.findUnique({
          where: { flagName: 'registration_open' },
        });
        console.log('[REGISTER] Feature flag data:', flagData);

        const registrationOpen = flagData?.enabled || false;
        console.log('[REGISTER] Registration open:', registrationOpen);

        if (!registrationOpen) {
          console.log('[REGISTER] Checking allowlist for:', email.toLowerCase());
          // Check if email is in allowlist
          const allowedEmail = await (prisma as any).allowedEmail.findUnique({
            where: { email: email.toLowerCase() },
          });
          console.log('[REGISTER] Allowed email found:', !!allowedEmail);

          if (!allowedEmail) {
            console.log('[REGISTER] Email not in allowlist, blocking registration');
            return errorResponse(
              'GolfIQ is currently in private beta. Join our waitlist at golfiq.ca to be notified when we launch!',
              403
            );
          }
        }
      }
    } catch (error) {
      console.error('[REGISTER] Error checking allowlist:', error);
      console.error('[REGISTER] Error stack:', (error as Error).stack);
      // If there's an error checking, allow registration (fail-open for now)
      // You can change this to fail-closed in production
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate username from email (for database constraint, not shown to users)
    const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    // Create user and profile in a transaction
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash: hashedPassword,
        profile: {
          create: {
            firstName: first_name,
            lastName: last_name,
          },
        },
      },
      select: {
        id: true,
        email: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Generate email verification token
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
        expiresAt: expiresAt,
      },
    });

    // Send verification email
    const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
    const { subject, html, text } = generateEmailVerificationEmail(verifyUrl, user.profile?.firstName || undefined);

    const emailSent = await sendEmail({
      to: user.email,
      subject,
      html,
      text,
      from: EMAIL_FROM.NOREPLY, // Email verification from noreply
    });

    if (!emailSent) {
      console.error('Failed to send verification email to:', user.email);
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id.toString() },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    return successResponse({
      user: {
        id: user.id.toString(),
        email: user.email,
        first_name: user.profile?.firstName || '',
        last_name: user.profile?.lastName || '',
      },
      token,
    });
  } catch (error) {
    // Handle unique constraint violations (Prisma error)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const prismaError = error as { meta?: { target?: string[] } };
      const field = prismaError.meta?.target?.[0];
      if (field === 'email') {
        return errorResponse('This email is already registered. Please use a different email or try logging in.', 400);
      }
      if (field === 'username') {
        return errorResponse('An account with this email already exists. Please try logging in.', 400);
      }
    }

    console.error('Register error:', error);
    return errorResponse('Failed to create account. Please try again.', 500);
  }
}