/**
 * Email Service with Resend
 */

import { Resend } from 'resend';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

const resend = new Resend(process.env.RESEND_API_KEY);

export const EMAIL_FROM = {
  NOREPLY: 'GolfIQ <noreply@golfiq.ca>',
  ONBOARDING: 'GolfIQ <onboarding@golfiq.ca>',
  UPDATES: 'GolfIQ <updates@golfiq.ca>',
} as const;

function getInternalNotificationRecipients(): string[] {
  const raw = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!raw) return [];

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function getAdminNotificationRecipient(): string | null {
  const raw = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!raw) return null;
  const recipient = raw.trim();
  return recipient.length > 0 ? recipient : null;
}

export async function sendEmail({ to, subject, html, text, from }: SendEmailOptions): Promise<boolean> {
  if (process.env.NODE_ENV === 'development') {
    console.log('\n========== EMAIL ===========');
    console.log('To:', to);
    console.log('From:', from || EMAIL_FROM.NOREPLY);
    console.log('Subject:', subject);
    console.log('Sending via Resend...');
    console.log('============================\n');
  }

  try {
    const { data, error } = await resend.emails.send({
      from: from || EMAIL_FROM.NOREPLY,
      to,
      subject,
      html,
      text,
    });

    if (error) {
      console.error('Resend error:', error);
      return false;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('Email sent successfully via Resend! ID:', data?.id);
    }

    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

export async function sendInternalNotificationEmail(
  options: Omit<SendEmailOptions, 'to'>
): Promise<boolean | null> {
  const recipients = getInternalNotificationRecipients();
  if (recipients.length === 0) {
    return null;
  }

  return sendEmail({
    ...options,
    to: recipients,
  });
}

export async function sendAdminNotificationEmail(
  options: Omit<SendEmailOptions, 'to'>
): Promise<boolean | null> {
  const recipient = getAdminNotificationRecipient();
  if (!recipient) {
    console.warn('ADMIN_NOTIFICATION_EMAIL is not set; skipping admin notification email.');
    return null;
  }

  return sendEmail({
    ...options,
    to: recipient,
  });
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type SignupNotificationEmailInput = {
  userId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  registeredAt: Date;
};

export function generateNewSignupInternalNotificationEmail({
  userId,
  email,
  firstName,
  lastName,
  registeredAt,
}: SignupNotificationEmailInput) {
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Not provided';
  const submittedAt = registeredAt.toISOString();
  const escapedFullName = escapeHtml(fullName);
  const escapedEmail = escapeHtml(email);
  const escapedUserId = escapeHtml(userId);
  const escapedSubmittedAt = escapeHtml(submittedAt);
  const subject = `New signup: ${email}`;

  const html = `
    <h2>New GolfIQ Signup</h2>
    <p>A new user created an account.</p>
    <ul>
      <li><strong>User ID:</strong> ${escapedUserId}</li>
      <li><strong>Email:</strong> ${escapedEmail}</li>
      <li><strong>Name:</strong> ${escapedFullName}</li>
      <li><strong>Created At:</strong> ${escapedSubmittedAt}</li>
    </ul>
  `;

  const text = [
    'New GolfIQ Signup',
    '',
    'A new user created an account.',
    `User ID: ${userId}`,
    `Email: ${email}`,
    `Name: ${fullName}`,
    `Created At: ${submittedAt}`,
  ].join('\n');

  return { subject, html, text };
}

type FeedbackNotificationEmailInput = {
  userId: string;
  userEmail: string;
  userName?: string | null;
  type: 'bug' | 'idea' | 'other';
  message: string;
  page: string | null;
  appVersion: string | null;
  submittedAt: Date;
};

export function generateFeedbackInternalNotificationEmail({
  userId,
  userEmail,
  userName,
  type,
  message,
  page,
  appVersion,
  submittedAt,
}: FeedbackNotificationEmailInput) {
  const normalizedUserName = userName?.trim() || 'Not provided';
  const normalizedPage = page || 'Not provided';
  const normalizedAppVersion = appVersion || 'Not provided';
  const normalizedSubmittedAt = submittedAt.toISOString();
  const subject = `New feedback (${type}) from ${userEmail}`;

  const html = `
    <h2>New GolfIQ Feedback</h2>
    <ul>
      <li><strong>User ID:</strong> ${escapeHtml(userId)}</li>
      <li><strong>Email:</strong> ${escapeHtml(userEmail)}</li>
      <li><strong>Name:</strong> ${escapeHtml(normalizedUserName)}</li>
      <li><strong>Type:</strong> ${escapeHtml(type)}</li>
      <li><strong>Page:</strong> ${escapeHtml(normalizedPage)}</li>
      <li><strong>App Version:</strong> ${escapeHtml(normalizedAppVersion)}</li>
      <li><strong>Submitted At:</strong> ${escapeHtml(normalizedSubmittedAt)}</li>
    </ul>
    <p><strong>Message</strong></p>
    <pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(message)}</pre>
  `;

  const text = [
    'New GolfIQ Feedback',
    '',
    `User ID: ${userId}`,
    `Email: ${userEmail}`,
    `Name: ${normalizedUserName}`,
    `Type: ${type}`,
    `Page: ${normalizedPage}`,
    `App Version: ${normalizedAppVersion}`,
    `Submitted At: ${normalizedSubmittedAt}`,
    '',
    'Message:',
    message,
  ].join('\n');

  return { subject, html, text };
}

const buttonInlineStyle = (bgColor: string) => `
  display:inline-block;
  background-color:${bgColor};
  color:#ffffff !important;
  text-decoration:none !important;
  font-weight:bold;
  font-size:16px;
  padding:16px 40px;
  border-radius:5px;
  min-width:200px;
  text-align:center;
  -webkit-text-size-adjust:none;
`;

/** GENERATE EMAIL VERIFICATION */
export function generateEmailVerificationEmail(verifyUrl: string, firstName?: string) {
  const subject = 'Verify your GolfIQ account';
  const greeting = firstName ? `Hello ${firstName}` : 'Hello';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height:1.6; color:#333; margin:0; padding:0; }
          .container { max-width:600px; margin:0 auto; padding:20px; }
          .header { background-color:#28a745; color:white; padding:20px; text-align:center; border-radius:5px 5px 0 0; }
          .content { background-color:#f9f9f9; padding:30px; border-radius:0 0 5px 5px; }
          .footer { margin-top:20px; padding-top:20px; border-top:1px solid #ddd; font-size:12px; color:#666; text-align:center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>Welcome to GolfIQ</h1></div>
          <div class="content">
            <p>${greeting},</p>
            <p>Thanks for signing up. Please verify your email to start tracking your golf game:</p>

            <!--[if mso]>
            <table align="center" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" bgcolor="#28a745" style="padding:16px 40px;">
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${verifyUrl}" style="height:50px;v-text-anchor:middle;width:200px;" arcsize="8%" strokecolor="#28a745" fillcolor="#28a745">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Verify Email Address</center>
                  </v:roundrect>
                </td>
              </tr>
            </table>
            <![endif]-->

            <!--[if !mso]><!-- -->
            <p style="text-align:center; margin:30px 0;">
              <a href="${verifyUrl}" target="_blank" rel="noopener" style="${buttonInlineStyle('#28a745')}">Verify Email Address</a>
            </p>
            <!--<![endif]-->

            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color:#28a745;">${verifyUrl}</p>
            <p><strong>This link will expire in 24 hours.</strong></p>
            <p>If you did not create a GolfIQ account, you can safely ignore this email.</p>
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} GolfIQ. All rights reserved.</div>
        </div>
      </body>
    </html>
  `;

  const text = `
Welcome to GolfIQ

${greeting},

Thanks for signing up. Please verify your email to start tracking your golf game:

${verifyUrl}

This link will expire in 24 hours.

If you did not create a GolfIQ account, you can safely ignore this email.

(c) ${new Date().getFullYear()} GolfIQ. All rights reserved.
  `.trim();

  return { subject, html, text };
}

/** GENERATE PASSWORD RESET EMAIL */
export function generatePasswordResetEmail(resetUrl: string) {
  const subject = 'Reset your GolfIQ password';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height:1.6; color:#333; margin:0; padding:0; }
          .container { max-width:600px; margin:0 auto; padding:20px; }
          .header { background-color:#007bff; color:white; padding:20px; text-align:center; border-radius:5px 5px 0 0; }
          .content { background-color:#f9f9f9; padding:30px; border-radius:0 0 5px 5px; }
          .footer { margin-top:20px; padding-top:20px; border-top:1px solid #ddd; font-size:12px; color:#666; text-align:center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>GolfIQ Password Reset</h1></div>
          <div class="content">
            <p>Hello,</p>
            <p>You requested a password reset. Click below to set a new password:</p>

            <!--[if mso]>
            <table align="center" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" bgcolor="#007bff" style="padding:16px 40px;">
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${resetUrl}" style="height:50px;v-text-anchor:middle;width:200px;" arcsize="8%" strokecolor="#007bff" fillcolor="#007bff">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Reset Password</center>
                  </v:roundrect>
                </td>
              </tr>
            </table>
            <![endif]-->

            <!--[if !mso]><!-- -->
            <p style="text-align:center; margin:30px 0;">
              <a href="${resetUrl}" target="_blank" rel="noopener" style="${buttonInlineStyle('#007bff')}">Reset Password</a>
            </p>
            <!--<![endif]-->

            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color:#007bff;">${resetUrl}</p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <p>If you did not request a password reset, you can safely ignore this email.</p>
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} GolfIQ. All rights reserved.</div>
        </div>
      </body>
    </html>
  `;

  const text = `
GolfIQ Password Reset

Hello,

You requested a password reset. Click below to set a new password:

${resetUrl}

This link will expire in 1 hour.

If you did not request a password reset, you can safely ignore this email.

(c) ${new Date().getFullYear()} GolfIQ. All rights reserved.
  `.trim();

  return { subject, html, text };
}
