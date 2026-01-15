# Authentication Features

This document describes the authentication and account management features implemented in GolfIQ.

## Features Overview

### 1. User Registration
- Users can register with email, password, first name, and last name
- Passwords must be at least 8 characters
- Email verification is sent automatically upon registration
- Users can use the app while unverified (verification is optional for now)

### 2. Email Verification
- **Automatic**: Verification email sent on registration
- **Token validity**: 24 hours
- **Flow**:
  1. User registers
  2. Verification email sent with unique token link
  3. User clicks link in email
  4. Token is validated and user's `emailVerified` field is set to `true`

### 3. Forgot Password Flow
- **Security**: Uses cryptographically secure tokens
- **Token validity**: 1 hour
- **Flow**:
  1. User visits `/forgot-password`
  2. Enters email address
  3. If account exists, reset email is sent
  4. User clicks reset link with token
  5. User enters new password (must be 8+ characters)
  6. Password is updated and token is marked as used

### 4. Password Reset
- One-time use tokens (marked as used after reset)
- Expired tokens cannot be used
- Old unused tokens are cleaned up when new ones are requested

## Pages

### `/login`
- Combined login and registration form
- Toggle between login and register modes
- "Forgot Password?" link (shown only in login mode)
- Password visibility toggle
- Automatic redirect to dashboard if already authenticated

### `/forgot-password`
- Email input form
- Sends password reset email
- Shows confirmation message (same message regardless of whether email exists - prevents email enumeration)

### `/reset-password?token=xxx`
- Password reset form
- Validates token on page load
- Requires password confirmation
- Redirects to login after successful reset

### `/verify-email?token=xxx`
- Automatic verification on page load
- Shows success or error message
- Links to dashboard or login

## API Endpoints

### `POST /api/users/register`
- Creates new user account
- Sends email verification email
- Returns user data and JWT token

### `POST /api/auth/forgot-password`
- Accepts: `{ email: string }`
- Creates password reset token
- Sends reset email
- Always returns success (prevents email enumeration)

### `POST /api/auth/reset-password`
- Accepts: `{ token: string, password: string }`
- Validates token (not expired, not used)
- Updates user password
- Marks token as used

### `POST /api/auth/verify-email`
- Accepts: `{ token: string }`
- Validates token (not expired, not used)
- Sets `user.emailVerified = true`
- Marks token as used

## Database Tables

### `password_reset_tokens`
- `id` - Primary key
- `email` - User's email
- `token` - Unique token (indexed)
- `expiresAt` - Expiration timestamp
- `usedAt` - Timestamp when used (null if unused)
- `createdDate` - Creation timestamp

### `email_verification_tokens`
- Same structure as password_reset_tokens
- Used for email verification instead of password resets

## Email Service

### Development
- Emails are logged to the console
- No actual emails are sent
- See console output for email content and links

### Production Setup (TODO)
To enable email sending in production:

1. Choose an email service provider:
   - **Resend** (recommended, simple API)
   - SendGrid
   - AWS SES
   - Mailgun

2. Install the SDK:
   ```bash
   npm install resend
   ```

3. Add API key to `.env`:
   ```bash
   RESEND_API_KEY="re_..."
   ```

4. Update `lib/email.ts`:
   ```typescript
   import { Resend } from 'resend';

   const resend = new Resend(process.env.RESEND_API_KEY);

   export async function sendEmail({ to, subject, html }: SendEmailOptions) {
     const { error } = await resend.emails.send({
       from: 'GolfIQ <noreply@yourdomain.com>',
       to,
       subject,
       html,
     });
     return !error;
   }
   ```

5. Set up sender domain verification in your email provider's dashboard

## Security Features

### Token Security
- Cryptographically secure random tokens (32 bytes, hex encoded)
- One-time use (marked as used after consumption)
- Time-limited expiration (1 hour for password reset, 24 hours for email verification)
- Old unused tokens automatically cleaned up when new ones requested

### Email Enumeration Prevention
- Forgot password always returns success message
- Same response whether email exists or not
- Prevents attackers from discovering valid email addresses

### Password Requirements
- Minimum 8 characters
- Maximum 100 characters
- No spaces allowed
- Hashed using bcrypt with salt rounds of 10

## User Experience Features

### Password Visibility Toggle
- Login and registration forms have eye icon to show/hide password
- Separate toggles for password and confirm password fields

### Modal Notifications
- All error and success messages appear as centered modals
- Require manual dismissal with OK button
- Clear visual distinction between success (green) and error (red)

### Automatic Redirects
- After password reset: redirects to login after 3 seconds
- Login page: redirects to dashboard if already authenticated
- Success pages have manual navigation buttons as well

## Post-Launch Checklist

- [ ] Configure production email service (Resend, SendGrid, etc.)
- [ ] Add email service API key to production environment
- [ ] Update `lib/email.ts` to use real email service
- [ ] Set up sender domain verification
- [ ] Test forgot password flow in production
- [ ] Test email verification flow in production
- [ ] Consider adding rate limiting to prevent abuse
- [ ] Consider adding CAPTCHA to forgot password form
- [ ] Monitor email delivery rates and bounces

## Future Enhancements (Optional)

- [ ] Force email verification before accessing certain features
- [ ] Add "Resend verification email" option
- [ ] Add email change flow (verify new email before switching)
- [ ] Add 2FA/MFA options
- [ ] Add OAuth providers (Google, Facebook, etc.)
- [ ] Add account recovery questions as backup
- [ ] Add email notifications for password changes
- [ ] Add email notifications for suspicious login attempts
