import Header from './Header';
import Footer from './Footer';
import Messages from './Messages';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <Header />
      <Messages mode="modal" />
      <main className="page-container">{children}</main>
      <Footer />
    </div>
  );
}
