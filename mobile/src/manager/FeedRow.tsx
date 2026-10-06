import { useEffect, useRef } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Feed } from '../../../lib/feed-storage';
import type { FeedSetLifecycleStatusItem } from '../../../lib/feed-set-lifecycle';
import type { ReaderPalette } from '../contracts';
import { readerFaces } from '../reader-theme';
import { Action, focusLater } from './controls';

export function FeedRow({ feed, palette, status, loading, confirming, pending, onCancel, onConfirm, onDelete, onEdit, onToggle }: {
  feed: Feed;
  palette: ReaderPalette;
  status?: FeedSetLifecycleStatusItem['status'];
  loading: boolean;
  confirming: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const cancel = useRef<View>(null);
  const deleteButton = useRef<View>(null);
  const { width } = useWindowDimensions();
  useEffect(() => { if (confirming) focusLater(() => cancel.current); }, [confirming]);
  const successful = status === 'success' || status === 'cached';
  const failed = status === 'error' || status === 'timeout';
  return <View style={{ flexDirection: width < 640 ? 'column' : 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
    <View style={{ flex: width < 640 ? undefined : 1, minWidth: 0, width: width < 640 ? '100%' : undefined }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <Text role="heading" aria-level={4} style={{ flexShrink: 1, maxWidth: '100%', color: palette.foreground, fontFamily: readerFaces.semibold, fontSize: 16, lineHeight: 25.6 }}>{feed.name}</Text>
        {feed.enabled && successful && <Svg width={16} height={16} viewBox="0 0 16 16" accessibilityRole="image" accessibilityLabel="Loaded successfully">
          <Path d="M3 8.5 6.5 12 13 4" fill="none" stroke={palette.background === '#1a1816' ? '#55b979' : '#2b7444'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>}
        {feed.enabled && failed && <Text style={{ color: palette.error, fontFamily: readerFaces.medium, fontSize: 12, lineHeight: 16 }}>× {status === 'timeout' ? 'Timed out' : 'Failed to load'}</Text>}
        {feed.enabled && status === 'pending' && <Text style={{ color: palette.muted, fontFamily: readerFaces.medium, fontSize: 12, lineHeight: 16 }}>{loading ? 'Checking' : 'Not checked'}</Text>}
        {!feed.enabled && <Text style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: palette.codeBackground, color: palette.subtle, fontFamily: readerFaces.regular, fontSize: 12, lineHeight: 16 }}>Disabled</Text>}
      </View>
      <Text numberOfLines={1} style={{ color: palette.muted, fontFamily: readerFaces.regular, fontSize: 14, lineHeight: 20 }}>{feed.url}</Text>
    </View>
    {confirming ? <View role="group" accessibilityLabel={`Confirm deletion of ${feed.name}`} style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <Action palette={palette} buttonRef={cancel} disabled={pending} onPress={() => { onCancel(); focusLater(() => deleteButton.current); }}>Cancel</Action>
      <Action palette={palette} kind="delete" label={`Delete “${feed.name}”`} disabled={pending} onPress={onConfirm}>Delete feed</Action>
    </View> : <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <Action palette={palette} disabled={pending} onPress={onToggle}>{feed.enabled ? 'Disable' : 'Enable'}</Action>
      <Action palette={palette} onPress={onEdit}>Edit</Action>
      <Action palette={palette} kind="danger" buttonRef={deleteButton} onPress={onDelete}>Delete</Action>
    </View>}
  </View>;
}
