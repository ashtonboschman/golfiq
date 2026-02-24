/**
 * Email Service with Resend
 */

import { Resend } from 'resend';

interface SendEmailOptions {
  to: string;
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

/** GENERATE WAITLIST CONFIRMATION EMAIL */
export function generateWaitlistConfirmationEmail({ name, confirmationUrl }: { name: string; confirmationUrl: string }) {
  const subject = 'Confirm your email for the GolfIQ beta waitlist';
  const greeting = name ? `Hello ${name}` : 'Hello';

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
          <div class="header"><h1>Confirm your email to join the beta</h1></div>
          <div class="content">
            <p>${greeting},</p>
            <p>Thanks for your interest in GolfIQ beta. To be considered for access, please confirm your email:</p>

            <!--[if mso]>
            <table align="center" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" bgcolor="#007bff" style="padding:16px 40px;">
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${confirmationUrl}" style="height:50px;v-text-anchor:middle;width:200px;" arcsize="8%" strokecolor="#007bff" fillcolor="#007bff">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Confirm Email Address</center>
                  </v:roundrect>
                </td>
              </tr>
            </table>
            <![endif]-->

            <!--[if !mso]><!-- -->
            <p style="text-align:center; margin:30px 0;">
              <a href="${confirmationUrl}" target="_blank" rel="noopener" style="${buttonInlineStyle('#007bff')}">Confirm Email Address</a>
            </p>
            <!--<![endif]-->

            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color:#007bff;">${confirmationUrl}</p>
            <p><strong>This link will expire in 24 hours.</strong></p>
            <p><strong>Next steps:</strong></p>
            <p>Once you confirm your email, you will be eligible for beta access. We review applications and will notify you if a spot becomes available.</p>
            <p>If you did not sign up for the waitlist, you can safely ignore this email.</p>
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} GolfIQ. All rights reserved.</div>
        </div>
      </body>
    </html>
  `;

  const text = `
Confirm your email to join the beta

${greeting},

Thanks for your interest in GolfIQ beta. To be considered for access, please confirm your email:

${confirmationUrl}

This link will expire in 24 hours.

Next steps:
Once you confirm your email, you will be eligible for beta access. We review applications and will notify you if a spot becomes available.

If you did not sign up for the waitlist, you can safely ignore this email.

(c) ${new Date().getFullYear()} GolfIQ. All rights reserved.
  `.trim();

  return { subject, html, text };
}

/** GENERATE BETA ACCESS EMAIL */
export function generateBetaAccessEmail(name?: string) {
  const subject = "You're in: access GolfIQ beta now";
  const greeting = name ? `Hello ${name}` : 'Hello';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://golfiq.ca';

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
          <div class="header"><h1>Welcome to GolfIQ beta</h1></div>
          <div class="content">
            <p>${greeting},</p>
            <p>Congrats, you now have access to GolfIQ beta.</p>
            <p>You can now register an account and start tracking your golf game with performance analytics and data-driven insights.</p>

            <!--[if mso]>
            <table align="center" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" bgcolor="#28a745" style="padding:16px 40px;">
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${appUrl}/login" style="height:50px;v-text-anchor:middle;width:200px;" arcsize="8%" strokecolor="#28a745" fillcolor="#28a745">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Create Your Account</center>
                  </v:roundrect>
                </td>
              </tr>
            </table>
            <![endif]-->

            <!--[if !mso]><!-- -->
            <p style="text-align:center; margin:30px 0;">
              <a href="${appUrl}/login" target="_blank" rel="noopener" style="${buttonInlineStyle('#28a745')}">Create Your Account</a>
            </p>
            <!--<![endif]-->

            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color:#28a745;">${appUrl}/login</p>

            <p><strong>What is included in the beta:</strong></p>
            <ul>
              <li>Comprehensive round tracking (After Round or Live Round)</li>
              <li>Post-round and overall insights based on your logged data</li>
              <li>Performance analytics and statistics</li>
              <li>Course database and tracking</li>
              <li>Friends and leaderboards</li>
              <li>Theme options and settings</li>
            </ul>
            <p>We would love to hear your feedback as you use the app.</p>
            <p>Welcome aboard.</p>
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} GolfIQ. All rights reserved.</div>
        </div>
      </body>
    </html>
  `;

  const text = `
Welcome to GolfIQ beta

${greeting},

Congrats, you now have access to GolfIQ beta.

You can now register an account and start tracking your golf game with performance analytics and data-driven insights.

Create your account here: ${appUrl}/login

What is included in the beta:
- Comprehensive round tracking (After Round or Live Round)
- Post-round and overall insights based on your logged data
- Performance analytics and statistics
- Course database and tracking
- Friends and leaderboards
- Theme options and settings

We would love to hear your feedback as you use the app.

Welcome aboard.

(c) ${new Date().getFullYear()} GolfIQ. All rights reserved.
  `.trim();

  return { subject, html, text };
}

/** GENERATE ANONYMOUS ADMIN NOTIFICATION EMAIL WHEN SOMEONE CONFIRMS WAITLIST EMAIL */
export function generateWaitlistAdminNotificationEmail({
  confirmationDate,
  source,
}: {
  confirmationDate: string;
  source?: string;
}) {
  const subject = 'Waitlist confirmation: a user confirmed their email';
  const greeting = 'Hello Admin,';

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
          .info { background-color:#e9ecef; padding:15px; border-radius:5px; margin:15px 0; }
          .info p { margin:5px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>Waitlist Email Confirmed</h1></div>
          <div class="content">
            <p>${greeting}</p>
            <p>Someone has confirmed their email for the GolfIQ beta waitlist.</p>

            <div class="info">
              <p><strong>Confirmation Date:</strong> ${confirmationDate}</p>
              ${source ? `<p><strong>Signup Source:</strong> ${source}</p>` : ''}
            </div>

            <p>You can now consider granting beta access when appropriate.</p>
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} GolfIQ. All rights reserved.</div>
        </div>
      </body>
    </html>
  `;

  const text = `
Waitlist Email Confirmed

${greeting}

Someone has confirmed their email for the GolfIQ beta waitlist.

Confirmation Date: ${confirmationDate}
${source ? `Signup Source: ${source}` : ''}

You can now consider granting beta access when appropriate.

(c) ${new Date().getFullYear()} GolfIQ. All rights reserved.
  `.trim();

  return { subject, html, text };
}
