import { Facebook, Instagram, Twitter } from 'lucide-react';

export default function SocialLinks() {
  const socials = [
    { name: 'Facebook', icon: <Facebook size={24} />, url: 'https://facebook.com/golfiqofficial' },
    { name: 'Instagram', icon: <Instagram size={24} />, url: 'https://instagram.com/GolfIQApp' },
    { name: 'X (Twitter)', icon: <Twitter size={24} />, url: 'https://x.com/GolfIQApp' },
    {
      name: 'TikTok',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
        </svg>
      ),
      url: 'https://tiktok.com/@GolfIQApp',
    },
    {
      name: 'Threads',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.186 3.094c-2.167 0-3.972.64-5.393 1.905-1.42 1.265-2.215 3.042-2.377 5.311l2.126.234c.13-1.82.71-3.235 1.735-4.23 1.024-.995 2.37-1.493 4.01-1.493 1.577 0 2.851.472 3.803 1.407.952.936 1.428 2.187 1.428 3.735v.35c-1.044-.274-2.176-.411-3.398-.411-2.303 0-4.158.583-5.533 1.736-1.375 1.153-2.063 2.724-2.063 4.695 0 1.893.644 3.411 1.933 4.537 1.289 1.126 2.947 1.689 4.962 1.689 2.329 0 4.205-.743 5.598-2.211.96-1.007 1.588-2.277 1.882-3.804.147-.762.22-1.65.22-2.663V10.88c0-2.356-.73-4.253-2.192-5.67-1.462-1.418-3.42-2.116-5.84-2.116zm4.012 10.72c0 1.767-.401 3.165-1.204 4.17-.802 1.005-1.953 1.508-3.452 1.508-1.125 0-2.047-.295-2.766-.884-.72-.59-1.08-1.376-1.08-2.357 0-1.098.403-1.983 1.21-2.655.806-.672 1.976-1.008 3.51-1.008.964 0 1.907.129 2.828.388v.838z" />
        </svg>
      ),
      url: 'https://threads.net/@GolfIQApp',
    },
  ];

  return (
    <div className="landing-social-links">
      <p className="landing-social-title">Follow @GolfIQApp</p>
      <div className="landing-social-icons">
        {socials.map((social) => (
          <a
            key={social.name}
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            className="landing-social-icon"
            aria-label={social.name}
          >
            {social.icon}
          </a>
        ))}
      </div>
    </div>
  );
}
