'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import UserHeaderCard from '@/components/UserHeaderCard';
import UserStatsCard from '@/components/UserStatsCard';
import UserActionsCard from '@/components/UserActionsCard';

interface UserData {
  user: any;
  stats: any;
  relationship: any;
  permissions: any;
}

export default function UserDetailsPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { data: session, status } = useSession();

  const [data, setData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }

    const fetchUser = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users/${id}/public`);

        if ([401, 403].includes(res.status)) {
          router.replace('/login');
          return;
        }

        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed to load user');

        setData(json);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (status === 'authenticated') {
      fetchUser();
    }
  }, [id, status, router]);

  if (loading) return <p className="loading-text">Loading user...</p>;
  if (!data) return <p className="error-text">User not found</p>;

  const { user, stats, relationship, permissions } = data;

  return (
    <div className="page-stack">
      <UserHeaderCard user={user} />
      <UserStatsCard stats={stats} />
      <UserActionsCard userId={user.id} permissions={permissions} />
    </div>
  );
}
