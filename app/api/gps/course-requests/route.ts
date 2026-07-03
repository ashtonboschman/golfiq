import { GpsCourseRequestStatus } from '@prisma/client';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireAuth, successResponse } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { EMAIL_FROM, sendAdminNotificationEmail } from '@/lib/email';
import { getLiveGpsAvailabilityForCourse } from '@/lib/gps/liveMapping';

const courseIdSchema = z.union([
  z.number().int().positive(),
  z.string().trim().regex(/^[1-9]\d*$/, 'Invalid courseId'),
]);

function parseCourseId(value: unknown) {
  const parsed = courseIdSchema.safeParse(value);
  if (!parsed.success) return null;

  try {
    return BigInt(parsed.data);
  } catch {
    return null;
  }
}

async function findCourse(courseId: bigint) {
  return prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      clubName: true,
      courseName: true,
      location: {
        select: {
          city: true,
          state: true,
          country: true,
        },
      },
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildAdminGpsCourseRequestEmail(args: {
  courseId: string;
  clubName: string;
  courseName: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
}) {
  const course = args.clubName === args.courseName
    ? args.courseName
    : `${args.clubName} - ${args.courseName}`;
  const location = [args.city, args.state, args.country].filter(Boolean).join(', ') || 'Not provided';
  const user = args.userName || args.userEmail || args.userId;
  const userEmail = args.userEmail || 'Not provided';
  const subject = `[GolfIQ] GPS mapping request - ${course}`;
  const text = [
    'GPS mapping requested',
    '',
    `Course: ${course}`,
    `Location: ${location}`,
    `Course ID: ${args.courseId}`,
    '',
    `User: ${user}`,
    `User Email: ${userEmail}`,
    `User ID: ${args.userId}`,
  ].join('\n');
  const html = `
    <p>GPS mapping requested</p>
    <ul>
      <li><strong>Course:</strong> ${escapeHtml(course)}</li>
      <li><strong>Location:</strong> ${escapeHtml(location)}</li>
      <li><strong>Course ID:</strong> ${escapeHtml(args.courseId)}</li>
    </ul>
    <p><strong>User:</strong> ${escapeHtml(user)}<br /><strong>User Email:</strong> ${escapeHtml(userEmail)}<br /><strong>User ID:</strong> ${escapeHtml(args.userId)}</p>
  `;

  return { subject, text, html };
}

function handleError(error: unknown, method: 'GET' | 'POST') {
  if (error instanceof Error && error.message === 'Unauthorized') {
    return errorResponse('Unauthorized', 401);
  }

  console.error(`${method} /api/gps/course-requests error:`, error);
  return errorResponse('Unable to process GPS mapping request', 500);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const courseId = parseCourseId(new URL(request.url).searchParams.get('courseId'));
    if (!courseId) return errorResponse('Invalid courseId', 400);
    if (!await findCourse(courseId)) return errorResponse('Course not found', 404);

    const [currentRequest, requestCount] = await Promise.all([
      prisma.gpsCourseRequest.findUnique({
        where: { courseId_userId: { courseId, userId } },
        select: { status: true },
      }),
      prisma.gpsCourseRequest.count({
        where: { courseId, status: GpsCourseRequestStatus.REQUESTED },
      }),
    ]);

    return successResponse({
      requestedByCurrentUser: currentRequest?.status === GpsCourseRequestStatus.REQUESTED,
      status: currentRequest?.status ?? null,
      requestCount,
    });
  } catch (error) {
    return handleError(error, 'GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body', 400);
    }

    const courseId = parseCourseId(
      body && typeof body === 'object' && 'courseId' in body
        ? (body as { courseId?: unknown }).courseId
        : undefined,
    );
    if (!courseId) return errorResponse('Invalid courseId', 400);
    const course = await findCourse(courseId);
    if (!course) return errorResponse('Course not found', 404);

    const availability = await getLiveGpsAvailabilityForCourse(courseId);
    if (availability.available && availability.coverage === 'full') {
      return errorResponse('Live GPS is already available for this course', 409);
    }

    const existingRequest = await prisma.gpsCourseRequest.findUnique({
      where: { courseId_userId: { courseId, userId } },
      select: { status: true },
    });
    const gpsRequest = await prisma.gpsCourseRequest.upsert({
      where: { courseId_userId: { courseId, userId } },
      create: {
        courseId,
        userId,
        status: GpsCourseRequestStatus.REQUESTED,
      },
      update: { status: GpsCourseRequestStatus.REQUESTED },
      select: { status: true },
    });

    if (existingRequest?.status !== GpsCourseRequestStatus.REQUESTED) {
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
      const userName = [user?.profile?.firstName, user?.profile?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || null;
      const notification = buildAdminGpsCourseRequestEmail({
        courseId: course.id.toString(),
        clubName: course.clubName,
        courseName: course.courseName,
        city: course.location?.city,
        state: course.location?.state,
        country: course.location?.country,
        userId: userId.toString(),
        userName,
        userEmail: user?.email ?? null,
      });
      const emailSent = await sendAdminNotificationEmail({
        ...notification,
        from: EMAIL_FROM.UPDATES,
      });
      if (emailSent === false) {
        console.warn('Failed to send GPS mapping request admin notification email.');
      }
    }

    return successResponse({
      requested: gpsRequest.status === GpsCourseRequestStatus.REQUESTED,
      status: gpsRequest.status,
      message: 'GPS mapping requested',
    });
  } catch (error) {
    return handleError(error, 'POST');
  }
}
