import { useLayoutEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { FeedLimitError, FeedStorageError, type Feed, type FeedImportEntry, type FeedImportSummary, type FeedManagerOperationResult } from '../../lib/feed-storage';
import { feedActivityAnnouncement, type FeedLoadActivity } from '../../lib/feed-load-activity';
import type { FeedSetLifecycleStatusItem } from '../../lib/feed-set-lifecycle';
import type { ReaderPalette } from './contracts';
import type { SubscriptionCommand } from './useSubscriptions';
import { readerFaces } from './reader-theme';
import { ManagerModal } from './manager/Modal';
import { FeedForm } from './manager/Form';
import { FeedRow } from './manager/FeedRow';
import { ManagerActivity } from './manager/Activity';
import { Action, focusLater } from './manager/controls';
import { OpmlInput, exportSubscriptions } from './manager/transfer';

type Pending = { type: 'add' | 'import' } | { type: 'edit'; session: number };
type Failure = { type: Pending['type'] | 'toggle' | 'delete' | 'export' | 'refresh'; message: string; session?: number };
type EditSession = { feed: Feed; session: number };

export interface FeedManagerProps {
  feeds: Feed[];
  apply: (command: SubscriptionCommand) => Promise<FeedManagerOperationResult>;
  isOpen: boolean;
  onClose: () => void;
  palette: ReaderPalette;
  activity: FeedLoadActivity;
  feedStatuses: FeedSetLifecycleStatusItem[];
  onRefreshFeeds: () => Promise<void>;
}

function failureMessage(error: unknown, fallback: string) {
  return error instanceof FeedStorageError || error instanceof FeedLimitError ? error.message : fallback;
}

function importMessage(summary: FeedImportSummary) {
  const skipped = [
    summary.skippedDuplicate ? `${summary.skippedDuplicate} duplicate` : '',
    summary.invalid ? `${summary.invalid} invalid` : '',
    summary.overLimit ? `${summary.overLimit} over limit` : '',
  ].filter(Boolean);
  return `Imported ${summary.added} ${summary.added === 1 ? 'feed' : 'feeds'}${skipped.length ? `, skipped ${skipped.join(', ')}` : ''}`;
}

export function FeedManager({ feeds, apply, isOpen, onClose, palette, activity, feedStatuses, onRefreshFeeds }: FeedManagerProps) {
  const [editing, setEditing] = useState<EditSession | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(feeds.length === 0);
  const [transferOpen, setTransferOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const [pendingRows, setPendingRows] = useState<ReadonlySet<string>>(new Set());
  const pendingRowsRef = useRef(new Set<string>());
  const [failure, setFailure] = useState<Failure | null>(null);
  const [message, setMessage] = useState('');
  const session = useRef(0);
  const heading = useRef<View>(null);
  const openRef = useRef(isOpen);
  useLayoutEffect(() => { openRef.current = isOpen; }, [isOpen]);
  const { width } = useWindowDimensions();
  const loading = activity.type === 'loading';
  const recovery = ['partial', 'interrupted', 'fallback', 'failed'].includes(activity.type);
  const setOperation = (operation: Pending | null) => { pendingRef.current = operation; setPending(operation); };
  const focusList = () => focusLater(() => openRef.current ? heading.current : null);
  const clearFailure = (type: Failure['type']) => setFailure(current => current?.type === type ? null : current);

  const save = async (command: Extract<SubscriptionCommand, { type: 'add' | 'edit' }>, editSession?: number) => {
    if (pendingRef.current) return false;
    setOperation(command.type === 'edit' ? { type: 'edit', session: editSession! } : { type: 'add' });
    setFailure(null);
    setMessage(command.type === 'add' ? 'Adding feed…' : 'Saving changes…');
    try {
      await apply(command);
      setMessage(command.type === 'add' ? 'Feed added.' : 'Changes saved.');
      if (command.type === 'edit') {
        setEditing(current => current?.session === editSession ? null : current);
        if (session.current === editSession) focusList();
      }
      return true;
    } catch (error) {
      setMessage('');
      setFailure({ type: command.type, session: editSession, message: failureMessage(error, command.type === 'add'
        ? 'Unable to add this feed. Check that the URL points to a valid RSS or Atom feed, then try again.'
        : 'Unable to save these changes. Check the feed URL and try again.') });
      return false;
    } finally { setOperation(null); }
  };

  const mutate = async (type: 'toggle' | 'delete', id: string) => {
    if (pendingRowsRef.current.has(id)) return;
    pendingRowsRef.current.add(id);
    setPendingRows(new Set(pendingRowsRef.current));
    setFailure(null);
    setMessage('');
    try {
      await apply({ type, id });
      if (type === 'delete') {
        setDeletingId(current => current === id ? null : current);
        focusList();
      }
    } catch (error) {
      setFailure({ type, message: failureMessage(error, 'Unable to save this change. Try again.') });
    } finally {
      pendingRowsRef.current.delete(id);
      setPendingRows(new Set(pendingRowsRef.current));
    }
  };

  const importFile = async (read: () => Promise<FeedImportEntry[]>) => {
    if (pendingRef.current) return;
    setOperation({ type: 'import' });
    setFailure(null);
    setMessage('Reading OPML file…');
    try {
      const entries = await read();
      setMessage(`Found ${entries.length} feeds. Importing…`);
      const result = await apply({ type: 'import-opml', feeds: entries });
      if (result.type === 'import-opml') setMessage(importMessage(result.summary));
    } catch (error) {
      setMessage('');
      setFailure({ type: 'import', message: failureMessage(error, 'Unable to import this OPML file. Choose a valid OPML or XML file and try again.') });
    } finally { setOperation(null); }
  };

  const refresh = async () => {
    if (loading) return;
    setMessage('');
    clearFailure('refresh');
    try { await onRefreshFeeds(); }
    catch { setFailure({ type: 'refresh', message: 'Unable to refresh feeds. Try again.' }); }
    finally { focusList(); }
  };

  const disclosure = (label: string, open: boolean, toggle: () => void) => <Pressable role="button" accessibilityLabel={`${label} options`} accessibilityState={{ expanded: open }} aria-expanded={open} onPress={toggle}
    style={{ backgroundColor: palette.codeBackground, borderColor: palette.controlBorder, borderWidth: 1, borderRadius: 4, paddingHorizontal: 16, paddingVertical: 12 }}>
    <Text style={{ color: palette.foreground, fontFamily: readerFaces.semibold, fontSize: 16, lineHeight: 25.6 }}>{open ? '▾' : '▸'} <Text>{label}</Text></Text>
  </Pressable>;
  const errorText = (types: Failure['type'][]) => failure && types.includes(failure.type)
    ? <Text role="alert" style={{ color: palette.error, fontFamily: readerFaces.regular, fontSize: 14, lineHeight: 20, marginTop: 12 }}>{failure.message}</Text> : null;

  return <ManagerModal isOpen={isOpen} onClose={onClose} palette={palette}>
    <View style={{ paddingHorizontal: width < 640 ? 16 : 24, paddingVertical: 16, borderBottomWidth: 1, borderColor: palette.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <Text nativeID="feed-manager-title" role="heading" aria-level={2} style={{ color: palette.foreground, fontFamily: readerFaces.bold, fontSize: 24, lineHeight: 32 }}>Manage feeds</Text>
        <Pressable role="button" accessibilityLabel="Close feed manager" onPress={onClose} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: palette.muted, fontFamily: readerFaces.regular, fontSize: 24, lineHeight: 24 }}>×</Text>
        </Pressable>
      </View>
      {isOpen && <ManagerActivity activity={activity} palette={palette} />}
    </View>
    <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingHorizontal: width < 640 ? 16 : 24, paddingVertical: 16 }}>
      <View testID="add-feed-section">
        {disclosure('Add feed', addOpen, () => setAddOpen(!addOpen))}
        <View style={{ display: addOpen ? 'flex' : 'none' }}>
          <FeedForm palette={palette} isEditing={editing !== null} pending={pending?.type === 'add'} disabled={pending !== null}
            failure={failure?.type === 'add' ? failure.message : null} onChange={() => clearFailure('add')} onSubmit={draft => save({ type: 'add', ...draft })} />
        </View>
      </View>
      <View style={{ marginTop: 12 }}>
        {disclosure('Import and export', transferOpen, () => setTransferOpen(!transferOpen))}
        <View style={{ display: transferOpen ? 'flex' : 'none' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
            <OpmlInput palette={palette} disabled={pending !== null} onImport={importFile} onChoose={() => clearFailure('import')} />
            <Action palette={palette} disabled={pending !== null} small={false} style={{ paddingHorizontal: 16 }} onPress={() => {
              clearFailure('export');
              try { exportSubscriptions(feeds); }
              catch { setFailure({ type: 'export', message: 'Unable to export your feeds. Try again.' }); }
            }}>Export OPML</Action>
          </View>
          {errorText(['import', 'export'])}
        </View>
      </View>
      <View style={{ marginTop: 24 }} aria-labelledby="feed-list-title">
        <View ref={heading} nativeID="feed-list-title" role="heading" aria-level={3} tabIndex={-1} style={{ marginBottom: 12 }}><Text style={{ color: palette.foreground, fontFamily: readerFaces.semibold, fontSize: 18, lineHeight: 28 }}>Feeds ({feeds.length})</Text></View>
        {errorText(['toggle', 'delete', 'refresh'])}
        <Action palette={palette} disabled={loading || !feeds.some(feed => feed.enabled)} style={{ paddingHorizontal: 16, marginBottom: 16 }} onPress={() => { void refresh(); }}>
          {loading ? 'Refreshing feeds…' : recovery ? 'Try all feeds again' : 'Refresh feeds'}
        </Action>
        <View style={{ gap: 12 }}>
          {feeds.map(feed => <View key={feed.id} testID={`feed-row-${feed.id}`} style={{ padding: 16, borderWidth: 1, borderRadius: 4, borderColor: palette.controlBorder, backgroundColor: feed.enabled ? 'transparent' : palette.codeBackground }}>
            {editing?.feed.id === feed.id ? <FeedForm key={editing.session} feed={editing.feed} palette={palette}
              pending={pending?.type === 'edit' && pending.session === editing.session} disabled={pending !== null}
              failure={failure?.type === 'edit' && failure.session === editing.session ? failure.message : null}
              onChange={() => clearFailure('edit')}
              onSubmit={draft => save({ type: 'edit', id: feed.id, ...draft }, editing.session)}
              onCancel={() => { session.current += 1; setEditing(null); clearFailure('edit'); focusList(); }} />
              : <FeedRow feed={feed} palette={palette} status={feedStatuses.find(item => item.feedUrl === feed.url)?.status} loading={loading}
                confirming={deletingId === feed.id} pending={pendingRows.has(feed.id)}
                onCancel={() => setDeletingId(null)} onConfirm={() => { void mutate('delete', feed.id); }}
                onDelete={() => setDeletingId(feed.id)} onToggle={() => { void mutate('toggle', feed.id); }}
                onEdit={() => { clearFailure('edit'); session.current += 1; setEditing({ feed, session: session.current }); }} />}
          </View>)}
        </View>
      </View>
    </ScrollView>
    <Text role="status" accessibilityLabel="Feed activity" aria-live={isOpen ? 'polite' : 'off'} style={styles.hidden}>{isOpen ? feedActivityAnnouncement(activity) : ''}</Text>
    <Text role="status" accessibilityLabel="Subscription updates" aria-live={isOpen ? 'polite' : 'off'} style={styles.hidden}>{isOpen ? message : ''}</Text>
  </ManagerModal>;
}

const styles = StyleSheet.create({ hidden: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } });
