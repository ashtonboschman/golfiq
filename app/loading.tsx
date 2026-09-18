import AppBootVisual from '@/components/AppBootVisual';

export default function Loading() {
  return (
    <div className="app-boot-overlay" role="status" aria-live="polite" aria-label="Loading">
      <AppBootVisual />
    </div>
  );
}
