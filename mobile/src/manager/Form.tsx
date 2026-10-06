import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { Feed } from '../../../lib/feed-storage';
import type { ReaderPalette } from '../contracts';
import { readerFaces } from '../reader-theme';
import { Action, focusLater } from './controls';

type Draft = Pick<Feed, 'name' | 'url'>;
type Errors = Record<keyof Draft, string | null>;
const EMPTY_ERRORS: Errors = { name: null, url: null };

function validate(draft: Draft): Errors {
  const errors: Errors = { name: draft.name.trim() ? null : 'Enter a feed name.', url: null };
  if (!draft.url.trim()) errors.url = 'Enter a feed URL.';
  else {
    try {
      const url = new URL(draft.url.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') errors.url = 'Enter an HTTP or HTTPS feed URL.';
    } catch { errors.url = 'Enter a valid feed URL.'; }
  }
  return errors;
}

export function FeedForm({ feed, isEditing, palette, pending, disabled, failure, onChange, onSubmit, onCancel }: {
  feed?: Feed;
  isEditing?: boolean;
  palette: ReaderPalette;
  pending: boolean;
  disabled: boolean;
  failure: string | null;
  onChange: () => void;
  onSubmit: (draft: Draft) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({ name: feed?.name ?? '', url: feed?.url ?? '' });
  const [errors, setErrors] = useState<Errors>(EMPTY_ERRORS);
  const nameRef = useRef<TextInput>(null);
  const urlRef = useRef<TextInput>(null);
  const { width } = useWindowDimensions();
  useEffect(() => { if (feed) focusLater(() => nameRef.current); }, [feed?.id]);
  const submit = async () => {
    if (disabled) return;
    const next = validate(draft);
    setErrors(next);
    if (next.name || next.url) {
      (next.name ? nameRef : urlRef).current?.focus();
      return;
    }
    if (await onSubmit({ name: draft.name.trim(), url: draft.url.trim() })) {
      setDraft({ name: '', url: '' });
      setErrors(EMPTY_ERRORS);
    }
  };
  return <View role="form" accessibilityLabel={feed ? `Edit ${feed.name}` : 'Add feed'} aria-busy={pending}
    style={{ gap: 12, marginTop: feed ? 0 : 16 }}>
    {(['name', 'url'] as const).map(field => {
      const id = feed ? `edit-feed-${field}-${feed.id}` : `new-feed-${field}`;
      const errorId = `${id}-error`;
      return <View key={field}>
        <Text nativeID={`${id}-label`} style={{ color: palette.foreground, fontFamily: readerFaces.medium, fontSize: 14, lineHeight: 20, marginBottom: 4 }}>
          {field === 'name' ? 'Feed name' : 'Feed URL'}
        </Text>
        <TextInput ref={field === 'name' ? nameRef : urlRef} nativeID={id}
          accessibilityLabel={field === 'name' ? 'Feed name' : 'Feed URL'}
          aria-labelledby={`${id}-label`} aria-describedby={errorId} aria-invalid={errors[field] !== null}
          aria-required readOnly={pending} autoCapitalize="none" autoCorrect={false}
          inputMode={field === 'url' ? 'url' : 'text'}
          placeholder={field === 'name' ? 'Example News' : 'https://example.com/feed.xml'}
          placeholderTextColor={palette.subtle} value={draft[field]}
          onSubmitEditing={() => { void submit(); }}
          onChangeText={value => {
            const next = { ...draft, [field]: value };
            setDraft(next);
            onChange();
            if (errors[field] && !validate(next)[field]) setErrors(current => ({ ...current, [field]: null }));
          }}
          style={{ width: '100%', paddingHorizontal: feed ? 12 : 16, paddingVertical: 8, borderRadius: 4, borderWidth: 1,
            borderColor: palette.controlBorder, backgroundColor: palette.background, color: palette.foreground,
            fontFamily: readerFaces.regular, fontSize: width < 640 ? 16 : 14, lineHeight: width < 640 ? 24 : 20,
          }} />
        <Text nativeID={errorId} style={{ marginTop: 4, fontFamily: readerFaces.regular, color: palette.error, fontSize: 14, lineHeight: 20 }}>{errors[field]}</Text>
      </View>;
    })}
    {failure && <Text role="alert" style={{ fontFamily: readerFaces.regular, fontSize: 14, lineHeight: 20, color: palette.error }}>{failure}</Text>}
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <Action palette={palette} disabled={disabled} kind={feed || !isEditing ? 'primary' : 'neutral'} small={!!feed}
        onPress={() => { void submit(); }}>
        {feed ? pending ? 'Save changes…' : 'Save changes' : pending ? 'Add feed…' : 'Add feed'}
      </Action>
      {feed && onCancel && <Action palette={palette} disabled={disabled} onPress={onCancel}>Cancel</Action>}
    </View>
  </View>;
}
