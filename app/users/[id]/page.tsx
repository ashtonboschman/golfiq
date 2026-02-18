'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import UserHeaderCard from '@/components/UserHeaderCard';
import UserStatsCard from '@/components/UserStatsCard';
import UserActionsCard from '@/components/UserActionsCard';
import { SkeletonBlock, SkeletonCircle } from '@/components/skeleton/Skeleton';

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

  const showDataSkeleton = status === 'loading' || loading;
  if (!showDataSkeleton && !data) return <p className="error-text">User not found</p>;

  const user = data?.user;
  const stats = data?.stats;
  const permissions = data?.permissions;

  return (
    <div className="page-stack">
      {showDataSkeleton ? (
        <div className="card user-header-card">
          <div className="avatar-wrapper">
            <SkeletonCircle size={202} />
          </div>
          <label className="form-label">Name</label>
          <SkeletonBlock className="skeleton-input" style={{ height: 42 }} />
          <label className="form-label">Bio</label>
          <SkeletonBlock width="100%" height={80} />
          <label className="form-label">Favorite Course</label>
          <SkeletonBlock className="skeleton-input" style={{ height: 42 }} />
        </div>
      ) : (
        <UserHeaderCard user={user} />
      )}

      {showDataSkeleton ? (
        <div className="card">
          <label className="form-label">Handicap</label>
          <SkeletonBlock className="skeleton-input" style={{ height: 42 }} />
          <label className="form-label">Average To Par</label>
          <SkeletonBlock className="skeleton-input" style={{ height: 42 }} />
          <label className="form-label">Best To Par</label>
          <SkeletonBlock className="skeleton-input" style={{ height: 42 }} />
          <label className="form-label">Total Rounds</label>
          <SkeletonBlock className="skeleton-input" style={{ height: 42 }} />
        </div>
      ) : (
        <UserStatsCard stats={stats} />
      )}

      {showDataSkeleton ? (
        <div className="card">
          <SkeletonBlock className="skeleton-btn" height={41} />
        </div>
      ) : (
        <UserActionsCard userId={user.id} permissions={permissions} />
      )}
    </div>
  );
}
