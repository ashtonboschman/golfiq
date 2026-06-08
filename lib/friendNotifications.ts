export interface FriendAcceptedNotification {
  id: number;
  actor_user_id: number;
  type: 'friend_request_accepted';
  first_name: string;
  last_name: string;
  avatar_url: string;
  read_at: string | null;
  created_at: string;
}
