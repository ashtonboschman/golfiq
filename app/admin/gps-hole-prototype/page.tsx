import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import GpsHolePrototype from '@/components/gps/GpsHolePrototype';
import { isAdminUserId } from '@/lib/admin';
import { authOptions } from '@/lib/auth-config';

export default async function GpsHolePrototypePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !isAdminUserId(session.user.id)) {
    redirect('/');
  }

  return <GpsHolePrototype />;
}
