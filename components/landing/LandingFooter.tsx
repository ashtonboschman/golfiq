import Link from 'next/link';
import SocialLinks from './SocialLinks';

export default function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <div className="landing-footer-content">
          <div className="landing-footer-socials">
            <SocialLinks />
          </div>
          <div className="landing-footer-links">
            <div className="landing-footer-section">
              <h4 className="landing-footer-heading">Product</h4>
              <Link href="/#features" className="landing-footer-link">
                Features
              </Link>
              <Link href="/#waitlist" className="landing-footer-link">
                Join Beta
              </Link>
            </div>

            <div className="landing-footer-section">
              <h4 className="landing-footer-heading">Company</h4>
              <Link href="/about" className="landing-footer-link">
                About
              </Link>
              <a href="mailto:hello@golfiq.ca" className="landing-footer-link">
                Contact
              </a>
            </div>

            <div className="landing-footer-section">
              <h4 className="landing-footer-heading">Legal</h4>
              <Link href="/privacy" className="landing-footer-link">
                Privacy Policy
              </Link>
              <Link href="/terms" className="landing-footer-link">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <p className="landing-footer-copyright">
            © {new Date().getFullYear()} GolfIQ. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
