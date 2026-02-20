import { Suspense } from 'react';
/* eslint-disable @next/next/no-img-element */
import Header from './Header';
import Footer from './Footer';
import Messages from './Messages';
import AppBootOverlay from './AppBootOverlay';

function HeaderFallback() {
  return (
    <header className="header" aria-hidden="true">
      <div className="header-inner">
        <div style={{ width: '40px' }} />
        <div className="logo-wrap">
          <img src="/logos/wordmark/golfiq-wordmark.png" alt="GolfIQ" height="40" className="logo logo-theme-dark" draggable={false} />
          <img src="/logos/wordmark/golfiq-wordmark-light.png" alt="GolfIQ" height="40" className="logo logo-theme-light" draggable={false} />
          <img src="/logos/wordmark/golfiq-wordmark-sunrise.png" alt="GolfIQ" height="40" className="logo logo-theme-sunrise" draggable={false} />
          <img src="/logos/wordmark/golfiq-wordmark-twilight.png" alt="GolfIQ" height="40" className="logo logo-theme-twilight" draggable={false} />
          <img src="/logos/wordmark/golfiq-wordmark-classic.png" alt="GolfIQ" height="40" className="logo logo-theme-classic" draggable={false} />
          <img src="/logos/wordmark/golfiq-wordmark-metallic.png" alt="GolfIQ" height="40" className="logo logo-theme-metallic" draggable={false} />
          <img src="/logos/wordmark/golfiq-wordmark-oceanic.png" alt="GolfIQ" height="40" className="logo logo-theme-oceanic" draggable={false} />
          <img src="/logos/wordmark/golfiq-wordmark-aurora.png" alt="GolfIQ" height="40" className="logo logo-theme-aurora" draggable={false} />
          <img src="/logos/wordmark/golfiq-wordmark-forest.png" alt="GolfIQ" height="40" className="logo logo-theme-forest" draggable={false} />
          <img src="/logos/wordmark/golfiq-wordmark-floral.png" alt="GolfIQ" height="40" className="logo logo-theme-floral" draggable={false} />
        </div>
        <div className="right-button header-avatar-placeholder" />
      </div>
    </header>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <AppBootOverlay />
      <Suspense fallback={<HeaderFallback />}>
        <Header />
      </Suspense>
      <Messages mode="modal" />
      <main className="page-container">{children}</main>
      <Footer />
    </div>
  );
}
