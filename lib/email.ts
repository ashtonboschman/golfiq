/**
 * Email Service with Resend
 */

import { Resend } from 'resend';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string; // Optional custom from address
}

const resend = new Resend(process.env.RESEND_API_KEY);

// Default from addresses for different email types
export const EMAIL_FROM = {
  NOREPLY: 'GolfIQ <noreply@golfiq.ca>',
  ONBOARDING: 'GolfIQ <onboarding@golfiq.ca>',
  UPDATES: 'GolfIQ <updates@golfiq.ca>',
} as const;

export async function sendEmail({ to, subject, html, text, from }: SendEmailOptions): Promise<boolean> {
  // Development mode: also log email to console for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log('\n========== EMAIL ===========');
    console.log('To:', to);
    console.log('From:', from || EMAIL_FROM.NOREPLY);
    console.log('Subject:', subject);
    console.log('Sending via Resend...');
    console.log('============================\n');
  }

  try {
    // Send email via Resend
    const { data, error } = await resend.emails.send({
      from: from || EMAIL_FROM.NOREPLY, // Use provided from or default to noreply
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

export function generateEmailVerificationEmail(verifyUrl: string, firstName?: string): { subject: string; html: string; text: string } {
  const subject = 'Verify your GolfIQ account';

  const greeting = firstName ? `Hello ${firstName}` : 'Hello';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #28a745; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
          .button-container { text-align: center; margin: 30px 0; }
          .button {
            display: inline-block;
            background-color: #28a745;
            color: white !important;
            padding: 16px 40px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            font-size: 16px;
            min-width: 200px;
            text-align: center;
          }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
          @media only screen and (max-width: 600px) {
            .container { padding: 10px !important; }
            .content { padding: 20px !important; }
            .button { padding: 14px 30px !important; min-width: 150px !important; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to GolfIQ!</h1>
          </div>
          <div class="content">
            <p>${greeting},</p>
            <p>Thank you for registering! Please verify your email address to complete your account setup:</p>
            <div class="button-container">
              <a href="${verifyUrl}" class="button" style="color: white; text-decoration: none;">Verify Email Address</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #28a745;">${verifyUrl}</p>
            <p><strong>This link will expire in 24 hours.</strong></p>
            <p>If you didn't create a GolfIQ account, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} GolfIQ. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
Welcome to GolfIQ!

${greeting},

Thank you for registering! Please verify your email address to complete your account setup:

${verifyUrl}

This link will expire in 24 hours.

If you didn't create a GolfIQ account, you can safely ignore this email.

© ${new Date().getFullYear()} GolfIQ. All rights reserved.
  `.trim();

  return { subject, html, text };
}

export function generatePasswordResetEmail(resetUrl: string): { subject: string; html: string; text: string } {
  const subject = 'Reset your GolfIQ password';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #007bff; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
          .button-container { text-align: center; margin: 30px 0; }
          .button {
            display: inline-block;
            background-color: #007bff;
            color: white !important;
            padding: 16px 40px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            font-size: 16px;
            min-width: 200px;
            text-align: center;
          }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
          @media only screen and (max-width: 600px) {
            .container { padding: 10px !important; }
            .content { padding: 20px !important; }
            .button { padding: 14px 30px !important; min-width: 150px !important; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>GolfIQ Password Reset</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>You requested to reset your password. Click the button below to reset it:</p>
            <div class="button-container">
              <a href="${resetUrl}" class="button" style="color: white; text-decoration: none;">Reset Password</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #007bff;">${resetUrl}</p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <p>If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} GolfIQ. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
GolfIQ Password Reset

Hello,

You requested to reset your password. Click the link below to reset it:

${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email.

© ${new Date().getFullYear()} GolfIQ. All rights reserved.
  `.trim();

  return { subject, html, text };
}

export function generateWaitlistConfirmationEmail({
  name,
  confirmationUrl,
}: {
  name: string;
  confirmationUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = 'Confirm your spot on the GolfIQ Beta 🏌️';

  const greeting = name ? `Hello ${name}` : 'Hello';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #007bff; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
          .button-container { text-align: center; margin: 30px 0; }
          .button {
            display: inline-block;
            background-color: #007bff;
            color: white !important;
            padding: 16px 40px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            font-size: 16px;
            min-width: 200px;
            text-align: center;
          }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
          @media only screen and (max-width: 600px) {
            .container { padding: 10px !important; }
            .content { padding: 20px !important; }
            .button { padding: 14px 30px !important; min-width: 150px !important; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to GolfIQ Beta!</h1>
          </div>
          <div class="content">
            <p>${greeting},</p>
            <p>Thanks for joining the GolfIQ Beta! Please confirm your email to secure your spot:</p>
            <div class="button-container">
              <a href="${confirmationUrl}" class="button" style="color: white; text-decoration: none;">Confirm Email</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #007bff;">${confirmationUrl}</p>
            <p><strong>This link will expire in 24 hours.</strong></p>
            <p>If you didn't sign up for the beta, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} GolfIQ. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
Welcome to GolfIQ Beta!

${greeting},

Thanks for joining the GolfIQ Beta! Please confirm your email to secure your spot:

${confirmationUrl}

This link will expire in 24 hours.

If you didn’t sign up for the beta, you can safely ignore this email.

© ${new Date().getFullYear()} GolfIQ. All rights reserved.
  `.trim();

  return { subject, html, text };
  
}
