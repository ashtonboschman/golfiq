import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
  Button,
  Hr,
  Section,
} from '@react-email/components';

interface WaitlistConfirmationEmailProps {
  email: string;
  name: string;
  confirmationUrl: string;
}

export default function WaitlistConfirmationEmail({
  name,
  confirmationUrl,
}: WaitlistConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>GolfIQ beta waitlist - confirm your email</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>
            <span style={logoGolf}>Golf</span>
            <span style={logoIQ}>IQ</span>
          </Heading>

          <Heading style={h2}>Welcome to GolfIQ beta</Heading>

          <Text style={text}>Hi {name},</Text>

          <Text style={text}>
            Thanks for joining the GolfIQ beta waitlist. Confirm your email to secure your spot and
            get updates when beta access is available.
          </Text>

          <Text style={text}>
            Please confirm your email address to continue:
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={confirmationUrl}>
              Confirm Email Address
            </Button>
          </Section>

          <Text style={text}>
            Or copy and paste this URL into your browser:
          </Text>
          <Text style={link}>{confirmationUrl}</Text>

          <Hr style={hr} />

          <Text style={text}>
            <strong>What happens next?</strong>
          </Text>
          <Text style={text}>
            - We will notify you when beta access opens
            <br />
            - Access is granted in stages as spots become available
            <br />
            - Your feedback helps improve GolfIQ
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            You are receiving this email because you signed up for the GolfIQ beta at golfiq.ca.
            <br />
            If you did not sign up, you can safely ignore this email.
          </Text>

          <Text style={footer}>
            Follow us: @GolfIQApp on Instagram, X, Facebook, TikTok and Threads
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: '#0F131A',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '600px',
};

const h1 = {
  fontSize: '32px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '0 0 30px',
};

const logoGolf = {
  color: '#EDEFF2',
};

const logoIQ = {
  color: '#2D6CFF',
};

const h2 = {
  color: '#EDEFF2',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '1.3',
  textAlign: 'center' as const,
  margin: '0 0 20px',
};

const text = {
  color: '#9AA3B2',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#2D6CFF',
  borderRadius: '8px',
  color: '#EDEFF2',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
};

const link = {
  color: '#2D6CFF',
  fontSize: '14px',
  wordBreak: 'break-all' as const,
  margin: '0 0 16px',
};

const hr = {
  borderColor: '#2A313D',
  margin: '24px 0',
};

const footer = {
  color: '#6B7280',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '16px 0 0',
  textAlign: 'center' as const,
};
