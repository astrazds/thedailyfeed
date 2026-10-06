import { ActivityIndicator, Text, View } from 'react-native';
import type { FeedLoadActivity } from '../../../lib/feed-load-activity';
import type { ReaderPalette } from '../contracts';
import { readerFaces } from '../reader-theme';
import { LoadingMotion } from '../LoadingMotion';

export function ManagerActivity({ activity, palette }: { activity: FeedLoadActivity; palette: ReaderPalette }) {
  if (activity.type === 'empty') return null;
  const ready = activity.type === 'ready';
  const loading = activity.type === 'loading';
  return <View style={{ marginTop: 16, padding: ready ? 0 : 16, borderWidth: ready ? 0 : 1,
    borderLeftWidth: ready ? 0 : 3, borderColor: loading ? palette.accent : palette.controlBorder,
    borderLeftColor: loading ? palette.accent : palette.error, borderRadius: 8,
    backgroundColor: ready ? 'transparent' : palette.codeBackground }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {loading && <LoadingMotion kind="rotate" active={loading}>
        <ActivityIndicator size={22} color={palette.accent} animating={false} hidesWhenStopped={false} />
      </LoadingMotion>}
      <View style={{ flex: 1, flexDirection: ready ? 'row' : 'column', flexWrap: ready ? 'wrap' : 'nowrap', alignItems: ready ? 'baseline' : 'stretch', columnGap: 12 }}>
        <Text style={{ fontFamily: readerFaces.semibold, fontSize: ready ? 13 : 16, lineHeight: ready ? 20.8 : 25.6,
          color: ready ? palette.background === '#1a1816' ? '#55b979' : '#2b7444' : palette.foreground }}>{activity.title}</Text>
        <Text style={{ marginTop: 4, fontFamily: readerFaces.regular, fontSize: 13, lineHeight: 20.8, color: palette.muted }}>{activity.detail}</Text>
      </View>
    </View>
    {loading && <View role="progressbar" accessibilityLabel="Feed loading progress"
      aria-valuemin={activity.total > 0 ? 0 : undefined} aria-valuemax={activity.total > 0 ? activity.total : undefined} aria-valuenow={activity.total > 0 ? activity.completed : undefined}
      accessibilityValue={activity.total > 0 ? { min: 0, max: activity.total, now: activity.completed } : undefined}
      style={{ height: 8, backgroundColor: palette.border, borderRadius: 16, marginTop: 14, overflow: 'hidden' }}>
      <View style={{ height: 8, width: `${activity.total ? Math.min(100, activity.completed / activity.total * 100) : 0}%`, backgroundColor: palette.accent, borderRadius: 16 }} />
    </View>}
  </View>;
}
