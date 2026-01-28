export interface FriendUser {
  id: number | null;
  user_id: number | null;
  first_name: string;
  last_name: string;
  avatar_url: string;
  type: 'friend' | 'incoming' | 'outgoing' | 'none';
  created_at?: string | null;
  handicap?: number | null;
  average_score?: number | null;
  best_score?: number | null;
  total_rounds?: number | null;
}

export function normalizeFriend(user: Partial<FriendUser> & { type: string }): FriendUser {
  if (!user.type) {
    throw new Error('normalizeFriend called without explicit type');
  }

  return {
    id: user.id ?? null,
    user_id: user.user_id ?? null,
    first_name: user.first_name ?? '',
    last_name: user.last_name ?? '',
    avatar_url: user.avatar_url ?? '/avatars/default.png',
    type: user.type as FriendUser['type'],
    created_at: user.created_at ?? null,
    handicap: user.handicap ?? null,
    average_score: user.average_score ?? null,
    best_score: user.best_score ?? null,
    total_rounds: user.total_rounds ?? null,
  };
}
