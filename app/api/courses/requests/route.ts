import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth, errorResponse, successResponse } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { EMAIL_FROM, sendAdminNotificationEmail } from '@/lib/email';

const createCourseRequestSchema = z.object({
  query: z.string().trim().max(255).optional(),
  courseName: z.string().trim().min(1, 'Course name is required').max(255),
  city: z.string().trim().max(100).optional(),
  province: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
  source: z.enum(['local_search', 'global_api_no_result', 'manual']).optional(),
});

function buildAdminCourseRequestTextEmail(args: {
  courseName: string;
  city?: string;
  province?: string;
  country?: string;
  query?: string;
  source: 'local_search' | 'global_api_no_result' | 'manual';
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
}) {
  const locationParts = [args.city, args.province, args.country].filter(Boolean);
  const location = locationParts.length > 0 ? locationParts.join(', ') : 'Not provided';
  const displayUser = args.userName || args.userEmail || args.userId;

  const subject = `[GolfIQ] Course request - ${args.courseName}`;
  const text = [
    'Course request submitted',
    '',
    `Course: ${args.courseName}`,
    `Location: ${location}`,
    `Query: ${args.query || 'Not provided'}`,
    `Source: ${args.source}`,
    '',
    `User: ${displayUser}`,
    `User ID: ${args.userId}`,
  ].join('\n');

  const html = `
    <p>Course request submitted</p>
    <ul>
      <li><strong>Course:</strong> ${args.courseName}</li>
      <li><strong>Location:</strong> ${location}</li>
      <li><strong>Query:</strong> ${args.query || 'Not provided'}</li>
      <li><strong>Source:</strong> ${args.source}</li>
    </ul>
    <p><strong>User:</strong> ${displayUser}<br /><strong>User ID:</strong> ${args.userId}</p>
  `;

  return { subject, text, html };
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const courseRequestModel = (prisma as any).courseRequest;
    if (!courseRequestModel) {
      return errorResponse(
        'Prisma client is missing model "courseRequest". Run `npx prisma generate` and restart the server.',
        500,
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body.', 400);
    }

    const rawCourseName =
      body && typeof body === 'object' && 'courseName' in body
        ? (body as { courseName?: unknown }).courseName
        : undefined;
    if (typeof rawCourseName !== 'string' || rawCourseName.trim().length === 0) {
      return errorResponse('Course name is required', 400);
    }

    const parsed = createCourseRequestSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Invalid request body.';
      return errorResponse(message, 400);
    }

    const normalized = {
      query: parsed.data.query || null,
      courseName: parsed.data.courseName,
      city: parsed.data.city || null,
      province: parsed.data.province || null,
      country: parsed.data.country || null,
      notes: parsed.data.notes || null,
      source: parsed.data.source || 'manual',
    };

    await courseRequestModel.create({
      data: {
        userId,
        query: normalized.query,
        courseName: normalized.courseName,
        city: normalized.city,
        province: normalized.province,
        country: normalized.country,
        notes: normalized.notes,
        status: 'pending',
        source: normalized.source,
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    const userName = [user?.profile?.firstName, user?.profile?.lastName].filter(Boolean).join(' ').trim() || null;

    const adminNotification = buildAdminCourseRequestTextEmail({
      courseName: normalized.courseName,
      city: normalized.city || undefined,
      province: normalized.province || undefined,
      country: normalized.country || undefined,
      query: normalized.query || undefined,
      source: normalized.source,
      userId: userId.toString(),
      userName,
      userEmail: user?.email ?? null,
    });

    const emailSent = await sendAdminNotificationEmail({
      subject: adminNotification.subject,
      text: adminNotification.text,
      html: adminNotification.html,
      from: EMAIL_FROM.UPDATES,
    });
    if (emailSent === false) {
      console.warn('Failed to send course request admin notification email.');
    }

    return successResponse({ message: "Course request sent. We'll let you know once it's added." }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }

    console.error('POST /api/courses/requests error:', error);
    return errorResponse('Failed to create course request.', 500);
  }
}
