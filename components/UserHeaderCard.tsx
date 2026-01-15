interface User {
  avatar_url?: string | null;
  first_name?: string;
  last_name?: string;
  bio?: string | null;
  favorite_course?: string | null;
}

interface UserHeaderCardProps {
  user: User;
}

export default function UserHeaderCard({ user }: UserHeaderCardProps) {
  const { avatar_url, first_name, last_name, bio, favorite_course } = user;

  return (
    <div className="card user-header-card">
      <div className="avatar-wrapper">
        <img src={avatar_url || '/avatars/default.png'} alt="User Avatar" className="avatar-image" />
      </div>
      <label className="form-label">Name:</label>
      <input
        type="text"
        value={first_name + ' ' + last_name}
        disabled={true}
        className="form-input"
      />
      <label className="form-label">Bio:</label>
      <textarea value={bio ? bio : ''} className="form-input" disabled={true} />
      <label className="form-label">Favorite Course:</label>
      <input
        type="text"
        value={favorite_course ? favorite_course : ''}
        disabled={true}
        className="form-input"
      />
    </div>
  );
}
