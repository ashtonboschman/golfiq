import { NextResponse } from 'next/server';
import { bootstrapUser } from '@/lib/bootstrap';

export async function POST() {
  await bootstrapUser();
  return NextResponse.json({ ok: true });
}