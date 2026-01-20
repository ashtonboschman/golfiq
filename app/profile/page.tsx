'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useMessage } from '../providers';
import { AsyncPaginate } from 'react-select-async-paginate';
import Select from 'react-select';
import { useUploadThing } from '@/lib/uploadthing';
import { useAvatar } from '@/context/AvatarContext';
import { Mail, SquarePen, Trash2, Upload, X, Eye, EyeOff } from 'lucide-react';
import { selectStyles } from '@/lib/selectStyles';

interface Profile {
  email: string;
  email_verified?: boolean;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  gender: string | null;
  default_tee: string | null;
  favorite_course_id: number | null;
  dashboard_visibility: string | null;
}

interface CourseOption {
  value: number;
  label: string;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { showMessage, clearMessage } = useMessage();
  const { updateAvatar } = useAvatar();
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<Profile>({
    email: '',
    first_name: '',
    last_name: '',
    avatar_url: '',
    bio: '',
    gender: 'unspecified',
    default_tee: 'blue',
    favorite_course_id: null,
    dashboard_visibility: 'private',
  });

  const [originalProfile, setOriginalProfile] = useState<Profile>(profile);
  const [favoriteCourseOption, setFavoriteCourseOption] = useState<CourseOption | null>(null);
  const [originalFavoriteCourseOption, setOriginalFavoriteCourseOption] = useState<CourseOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const { startUpload } = useUploadThing('avatarUploader');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  // Get user's geolocation for course sorting
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.log('Geolocation not available:', error);
        }
      );
    }
  }, []);

  const setFavoriteCourse = (course: { id: number; course_name: string } | null) => {
    if (!course) {
      setFavoriteCourseOption(null);
      setProfile((prev) => ({ ...prev, favorite_course_id: null }));
      return;
    }

    setProfile((prev) => ({ ...prev, favorite_course_id: course.id }));
    setFavoriteCourseOption({
      value: course.id,
      label: `${course.course_name}`,
    });
  };

  useEffect(() => {
    const fetchUser = async () => {
      if (status !== 'authenticated') return;
      setLoading(true);
      try {
        const res = await fetch('/api/users/me');

        if (res.status === 401 || res.status === 403) {
          router.replace('/login');
          return;
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Error loading profile');

        // Create a fresh profile object from the API data
        // Convert favorite_course_id to number to match form state type
        const profileData = {
          email: data.user.email ?? '',
          first_name: data.user.first_name ?? '',
          last_name: data.user.last_name ?? '',
          avatar_url: data.user.avatar_url ?? '',
          bio: data.user.bio ?? '',
          gender: data.user.gender ?? 'unspecified',
          default_tee: data.user.default_tee ?? 'blue',
          favorite_course_id: data.user.favorite_course_id ? Number(data.user.favorite_course_id) : null,
          dashboard_visibility: data.user.dashboard_visibility ?? 'private',
        };
        setProfile(profileData);
        setOriginalProfile(profileData);

        if (data.user.favorite_course_id) {
          try {
            const courseRes = await fetch(`/api/courses/${data.user.favorite_course_id}`);

            if (courseRes.ok) {
              const courseData = await courseRes.json();
              const courseOption = {
                value: courseData.course.id,
                label: courseData.course.course_name,
              };
              setFavoriteCourse(courseData.course);
              setFavoriteCourseOption(courseOption); // Set current state
              setOriginalFavoriteCourseOption(courseOption); // Set original for comparison
            }
          } catch (err) {
            console.error(err);
          }
        }
      } catch (err: any) {
        console.error(err);
        showMessage(err.message || 'Error loading profile', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [status, router]);

  // Close avatar menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(event.target as Node)) {
        setShowAvatarMenu(false);
      }
    };

    if (showAvatarMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAvatarMenu]);

  const loadCourseOptions = async (
    search: string,
    loadedOptions: any,
    additional?: { page: number }
  ) => {
    const page = additional?.page || 1;
    try {
      const locationParam = userLocation ? `&lat=${userLocation.lat}&lng=${userLocation.lng}` : '';
      const res = await fetch(
        `/api/courses?limit=20&page=${page || 1}${search ? `&search=${search}` : ''}${locationParam}`
      );

      if ([401, 403].includes(res.status)) {
        router.replace('/login');
        return { options: [], hasMore: false, additional: { page: 1 } };
      }

      const data = await res.json();
      if (data.type === 'error') throw new Error(data.message || 'Error fetching courses');

      const options = Array.isArray(data.courses)
        ? data.courses.map((course: any) => {
            const courseName = course.club_name == course.course_name ? course.course_name : course.club_name + ' - ' + course.course_name;
            const location = course.location;
            const city = location?.city || '';
            const state = location?.state || '';
            const locationString = city && state ? ` (${city}, ${state})` : '';
            return {
              value: course.id,
              label: courseName + locationString,
            };
          })
        : [];

      return {
        options,
        hasMore: options.length === 20,
        additional: { page: (page || 1) + 1 },
      };
    } catch (err: any) {
      console.error(err);
      showMessage(err.message || 'Error fetching courses', 'error');
      return { options: [], hasMore: false, additional: { page: 1 } };
    }
  };

  // Check if there are unsaved changes
  useEffect(() => {
    const profileChanged = JSON.stringify(profile) !== JSON.stringify(originalProfile);
    const courseChanged = favoriteCourseOption?.value !== originalFavoriteCourseOption?.value;
    const hasChanges = profileChanged || courseChanged;

    setHasChanges(hasChanges);

    // Set flag in sessionStorage for Header/Footer to check
    if (hasChanges) {
      sessionStorage.setItem('profile-has-changes', 'true');
    } else {
      sessionStorage.removeItem('profile-has-changes');
    }
  }, [profile, originalProfile, favoriteCourseOption, originalFavoriteCourseOption]);

  // Navigation warning when there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  const handleChange = (field: keyof Profile, value: any) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
    // Immediately mark as having changes for reliable navigation blocking
    sessionStorage.setItem('profile-has-changes', 'true');
  };

  const handleCancel = () => {
    setProfile(originalProfile);
    setFavoriteCourseOption(originalFavoriteCourseOption);
    // Clear changes flag immediately
    sessionStorage.removeItem('profile-has-changes');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessage();

    setLoading(true);
    try {
      const profileRes = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: profile.first_name,
          last_name: profile.last_name,
          avatar_url: profile.avatar_url,
          bio: profile.bio,
          gender: profile.gender,
          default_tee: profile.default_tee,
          favorite_course_id: profile.favorite_course_id,
          dashboard_visibility: profile.dashboard_visibility,
        }),
      });

      const profileData = await profileRes.json();
      if (!profileRes.ok) throw new Error(profileData.message || 'Error updating profile details');

      showMessage(profileData.message || 'Profile updated', profileData.type || 'success');
      setOriginalProfile(profile);
      setOriginalFavoriteCourseOption(favoriteCourseOption);

      // Refresh favorite course label
      if (profile.favorite_course_id) {
        const courseRes = await fetch(`/api/courses/${profile.favorite_course_id}`);

        if (courseRes.ok) {
          const courseData = await courseRes.json();
          setFavoriteCourse(courseData.course);
        }
      }
    } catch (err: any) {
      console.error(err);
      showMessage(err.message || 'Error updating profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setSendingVerification(true);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
      });

      const data = await res.json();

      if (data.type === 'success') {
        showMessage(data.message, 'success');
      } else {
        showMessage(data.message || 'Failed to send verification email', 'error');
      }
    } catch (error) {
      console.error('Resend verification error:', error);
      showMessage('An error occurred. Please try again.', 'error');
    } finally {
      setSendingVerification(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessage();

    const { currentPassword, newPassword, confirmPassword } = passwords;
    if (!currentPassword || !newPassword || !confirmPassword) {
      showMessage('All fields are required', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage('New passwords do not match', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/users/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.status === 401 || res.status === 403) {
        router.replace('/login');
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error changing password');

      showMessage(data.message || 'Password updated successfully', data.type || 'success');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordForm(false);
    } catch (err: any) {
      console.error(err);
      showMessage(err.message || 'Error changing password', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showMessage('Please upload an image file', 'error');
      return;
    }

    // Validate file size (4MB max)
    if (file.size > 4 * 1024 * 1024) {
      showMessage('Image must be smaller than 4MB', 'error');
      return;
    }

    setUploadingAvatar(true);
    clearMessage();

    try {
      const res = await startUpload([file]);
      if (!res || res.length === 0) {
        throw new Error('Upload failed');
      }

      const uploadedUrl = res[0].url;

      // Update profile with new avatar URL
      const profileRes = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          avatar_url: uploadedUrl,
        }),
      });

      const profileData = await profileRes.json();
      if (!profileRes.ok) throw new Error(profileData.message || 'Error updating avatar');

      setProfile((prev) => ({ ...prev, avatar_url: uploadedUrl }));
      setOriginalProfile((prev) => ({ ...prev, avatar_url: uploadedUrl }));
      updateAvatar(uploadedUrl); // Update global avatar context
      showMessage('Avatar updated successfully', 'success');
    } catch (err: any) {
      console.error(err);
      showMessage(err.message || 'Error uploading avatar', 'error');
    } finally {
      setUploadingAvatar(false);
      setShowAvatarMenu(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    clearMessage();

    try {
      // Update profile to set default avatar
      const defaultAvatarUrl = '/avatars/default.png';
      const profileRes = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          avatar_url: defaultAvatarUrl,
        }),
      });

      const profileData = await profileRes.json();
      if (!profileRes.ok) throw new Error(profileData.message || 'Error removing avatar');

      setProfile((prev) => ({ ...prev, avatar_url: defaultAvatarUrl }));
      setOriginalProfile((prev) => ({ ...prev, avatar_url: defaultAvatarUrl }));
      updateAvatar(defaultAvatarUrl); // Update global avatar context
      showMessage('Avatar removed successfully', 'success');
    } catch (err: any) {
      console.error(err);
      showMessage(err.message || 'Error removing avatar', 'error');
    } finally {
      setUploadingAvatar(false);
      setShowAvatarMenu(false);
    }
  };

  const handleLogout = async () => {
    if (hasChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        return;
      }
      sessionStorage.removeItem('profile-has-changes');
    }
    await signOut({ redirect: false });
    router.replace('/login');
  };

  const handleNavigation = (path: string) => {
    if (hasChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        sessionStorage.removeItem('profile-has-changes');
        router.push(path);
      }
    } else {
      router.push(path);
    }
  };

  if (status === 'loading') return <p className="loading-text">Loading...</p>;

  return (
    <div className="page-stack">
      {/* Email Verification Banner */}
      {profile.email_verified === false && (
        <div className="info-banner warning">
          <div className="info-banner-content">
            <div className="info-banner-icon"><Mail size='45'/></div>
            <div className="info-banner-text">
              <h4>Email Not Verified</h4>
              <p>
                Please verify your email address to access all features. Check your inbox for the verification link.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={sendingVerification}
              className="btn"
            >
              {sendingVerification ? 'Sending...' : 'Resend Email'}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="card">
        <div ref={avatarMenuRef} className="avatar-wrapper">
          <img
            src={profile.avatar_url || '/avatars/default.png'}
            alt="User Avatar"
            className="avatar-image"
          />
          <button
            type="button"
            onClick={() => setShowAvatarMenu(!showAvatarMenu)}
            disabled={uploadingAvatar || loading}
            className="avatar-edit-button"
            title="Edit Avatar"
          >
            <SquarePen/>
          </button>

          {showAvatarMenu && !uploadingAvatar && (
            <div className="avatar-menu">
              <input
                type="file"
                id="avatar-upload"
                accept="image/*"
                onChange={handleAvatarUpload}
                style={{ display: 'none' }}
                disabled={uploadingAvatar || loading}
              />
              <label
                htmlFor="avatar-upload"
                className="avatar-menu-item upload border-bottom"
              >
                <Upload/>
              </label>
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="avatar-menu-item remove"
              >
                <Trash2/>
              </button>
            </div>
          )}

          {uploadingAvatar && (
            <div className="avatar-uploading-text">
              Uploading...
            </div>
          )}
        </div>

        <label className="form-label">Email</label>
        <input type="email" value={profile.email} disabled className="form-input disabled" />

        <label className="form-label">First Name</label>
        <input
          type="text"
          value={profile.first_name || ''}
          disabled={loading}
          onChange={(e) => handleChange('first_name', e.target.value)}
          onFocus={(e) => {
            const len = e.target.value.length;
            e.target.setSelectionRange(len, len);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          enterKeyHint="done"
          className="form-input"
        />

        <label className="form-label">Last Name</label>
        <input
          type="text"
          value={profile.last_name || ''}
          disabled={loading}
          onChange={(e) => handleChange('last_name', e.target.value)}
          onFocus={(e) => {
            const len = e.target.value.length;
            e.target.setSelectionRange(len, len);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          enterKeyHint="done"
          className="form-input"
        />

        <label className="form-label">Bio</label>
        <textarea
          name="bio"
          value={profile.bio || ''}
          disabled={loading}
          onChange={(e) => {
            handleChange('bio', e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onFocus={(e) => {
            const len = e.target.value.length;
            e.target.setSelectionRange(len, len);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          rows={4}
          className="form-input"
          maxLength={250}
          placeholder="Tell us a bit about yourself! (max 250 chars)"
          wrap='soft'
          enterKeyHint="done"
        />

        <label className="form-label">Gender</label>
        <Select
          value={{ value: profile.gender || 'unspecified', label: profile.gender === 'male' ? 'Male' : profile.gender === 'female' ? 'Female' : 'Unspecified' }}
          isDisabled={loading}
          onChange={(option) => option && handleChange('gender', option.value)}
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'unspecified', label: 'Unspecified' },
          ]}
          isSearchable={false}
          styles={selectStyles}
        />

        <label className="form-label">Default Tee</label>
        <Select
          value={{ value: profile.default_tee || 'blue', label: (profile.default_tee || 'blue').charAt(0).toUpperCase() + (profile.default_tee || 'blue').slice(1) }}
          isDisabled={loading}
          onChange={(option) => option && handleChange('default_tee', option.value)}
          options={[
            { value: 'black', label: 'Black' },
            { value: 'blue', label: 'Blue' },
            { value: 'white', label: 'White' },
            { value: 'red', label: 'Red' },
            { value: 'gold', label: 'Gold' },
          ]}
          isSearchable={false}
          styles={selectStyles}
        />

        <label className="form-label">Favorite Course</label>
        <AsyncPaginate
          value={favoriteCourseOption}
          loadOptions={loadCourseOptions}
          onChange={(selected) => {
            setFavoriteCourseOption(selected); // Update the option state
            setFavoriteCourse(
              selected?.value ? { id: selected.value, course_name: selected.label } : null
            );
            // Immediately mark as having changes for reliable navigation blocking
            sessionStorage.setItem('profile-has-changes', 'true');
          }}
          isDisabled={loading}
          isClearable={true}
          additional={{ page: 1 }}
          placeholder="Search or Select Course"
          styles={selectStyles}
        />

        <label className="form-label">Dashboard Visibility</label>
        <Select
          value={{ value: profile.dashboard_visibility || 'private', label: (profile.dashboard_visibility || 'private').charAt(0).toUpperCase() + (profile.dashboard_visibility || 'private').slice(1) }}
          isDisabled={loading}
          onChange={(option) => option && handleChange('dashboard_visibility', option.value)}
          options={[
            { value: 'private', label: 'Private' },
            { value: 'friends', label: 'Friends' },
            { value: 'public', label: 'Public' },
          ]}
          isSearchable={false}
          styles={selectStyles}
        />

        {hasChanges && (
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-cancel"
              onClick={handleCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-save" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </form>

      {showPasswordForm ? (
        <form onSubmit={handlePasswordChange} className="card">
          <label className="form-label">Current Password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showCurrentPassword ? 'text' : 'password'}
              value={passwords.currentPassword}
              onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              onFocus={(e) => {
                const len = e.target.value.length;
                e.target.setSelectionRange(len, len);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              enterKeyHint="done"
              className="form-input"
              required
              disabled={loading}
              max={100}
            />
            <button
              type="button"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--color-secondary-text)',
              }}
              aria-label="Toggle current password visibility"
            >
              {showCurrentPassword ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
          </div>
          <label className="form-label">New Password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showNewPassword ? 'text' : 'password'}
              value={passwords.newPassword}
              onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
              onFocus={(e) => {
                const len = e.target.value.length;
                e.target.setSelectionRange(len, len);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              enterKeyHint="done"
              className="form-input"
              required
              disabled={loading}
              max={100}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--color-secondary-text)',
              }}
              aria-label="Toggle new password visibility"
            >
              {showNewPassword ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
          </div>
          <label className="form-label">Confirm New Password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
              onFocus={(e) => {
                const len = e.target.value.length;
                e.target.setSelectionRange(len, len);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              enterKeyHint="done"
              className="form-input"
              required
              disabled={loading}
              max={100}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--color-secondary-text)',
              }}
              aria-label="Toggle confirm password visibility"
            >
              {showConfirmPassword ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-cancel"
              onClick={() => {
                setShowPasswordForm(false);
                setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
                setShowCurrentPassword(false);
                setShowNewPassword(false);
                setShowConfirmPassword(false);
              }}
              disabled={loading}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-save" disabled={loading}>
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      ) : (
        <div className="card flex justify-center">
          <button
            type="button"
            className="btn btn-edit"
            onClick={() => setShowPasswordForm(true)}
            disabled={loading}
          >
            Change Password
          </button>
        </div>
      )}

      <div className="card">
        <button
          type="button"
          className="btn btn-edit"
          onClick={() => handleNavigation('/settings')}
          disabled={loading}
        >
          Settings
        </button>
      </div>
         <div className="card">
        <button type="button" className="btn btn-logout" onClick={handleLogout} disabled={loading}>
          Logout
        </button>
      </div>
    </div>
  );
}
