import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import { sendEmail, generateWaitlistConfirmationEmail } from '@/lib/email';
import { prisma } from '@/lib/db';

// GET - Fetch waitlist and allowed emails
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.id !== '1') {
      return NextResponse.json({ type: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const [waitlist, allowedEmails] = await Promise.all([
      prisma.waitlist.findMany({
        where: { confirmed: true }, // Only show confirmed emails
        orderBy: { createdDate: 'desc' },
      }),
      prisma.allowedEmail.findMany({ orderBy: { createdDate: 'desc' } }),
    ]);

    // Serialize BigInt and Dates
    const serializedWaitlist = waitlist.map((w) => ({
      ...w,
      id: w.id.toString(),
      createdDate: w.createdDate.toISOString(),
    }));

    const serializedAllowedEmails = allowedEmails.map((a) => ({
      ...a,
      id: a.id.toString(),
      createdDate: a.createdDate.toISOString(),
    }));

    return NextResponse.json({ waitlist: serializedWaitlist, allowedEmails: serializedAllowedEmails });
  } catch (error) {
    console.error('Admin waitlist fetch error:', error);
    return NextResponse.json({ type: 'error', message: 'Internal server error' }, { status: 500 });
  }
}

// POST - Add email to allowlist
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.id !== '1') {
      return NextResponse.json({ type: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { email, notes } = await req.json();
    if (!email) {
      return NextResponse.json({ type: 'error', message: 'Email is required' }, { status: 400 });
    }

    const allowedEmail = await prisma.allowedEmail.create({
      data: {
        email: email.toLowerCase(),
        addedBy: session.user.email || 'admin',
        notes: notes || null,
      },
    });

    // Serialize response
    const serializedAllowedEmail = {
      ...allowedEmail,
      id: allowedEmail.id.toString(),
      createdDate: allowedEmail.createdDate.toISOString(),
    };

    return NextResponse.json({ type: 'success', allowedEmail: serializedAllowedEmail });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ type: 'error', message: 'Email already in allowlist' }, { status: 409 });
    }
    console.error('Admin add to allowlist error:', error);
    return NextResponse.json({ type: 'error', message: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove email from allowlist
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.id !== '1') {
      return NextResponse.json({ type: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ type: 'error', message: 'ID is required' }, { status: 400 });
    }

    const deleted = await prisma.allowedEmail.delete({
      where: { id: BigInt(id) },
    });

    // Serialize deleted record in response
    const serializedDeleted = {
      ...deleted,
      id: deleted.id.toString(),
      createdDate: deleted.createdDate.toISOString(),
    };

    return NextResponse.json({ type: 'success', deleted: serializedDeleted });
  } catch (error) {
    console.error('Admin remove from allowlist error:', error);
    return NextResponse.json({ type: 'error', message: 'Internal server error' }, { status: 500 });
  }
}