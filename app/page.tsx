import { FeedContent } from '@/components/feed-content';
import { ErrorBoundary } from '@/components/error-boundary';
import { OfflineIndicator } from '@/components/offline-indicator';
import { InstallPrompt } from '@/components/install-prompt';

export default function Home() {
  return (
    <ErrorBoundary>
      {/* Feed Content (Client-side) */}
      <FeedContent />
      
      {/* Offline Indicator */}
      <OfflineIndicator />
      
      {/* PWA Install Prompt */}
      <InstallPrompt />
    </ErrorBoundary>
  );
}
