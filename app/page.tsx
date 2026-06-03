import { FeedContent } from '@/components/feed-content';
import { FeedManagerButton } from '@/components/feed-manager-button';
import { ErrorBoundary } from '@/components/error-boundary';
import { OfflineIndicator } from '@/components/offline-indicator';
import { InstallPrompt } from '@/components/install-prompt';

export default function Home() {
  return (
    <ErrorBoundary>
      {/* Floating Feed Manager Button */}
      <FeedManagerButton />
      
      {/* Feed Content (Client-side) */}
      <FeedContent />
      
      {/* Offline Indicator */}
      <OfflineIndicator />
      
      {/* PWA Install Prompt */}
      <InstallPrompt />
    </ErrorBoundary>
  );
}
