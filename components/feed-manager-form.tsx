import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Feed } from '@/lib/feed-storage';
import { focusAfterUpdate } from './feed-delete-actions';

type FeedDraft = Pick<Feed, 'name' | 'url'>;

type FormMode =
  | { type: 'add'; isEditing: boolean }
  | { type: 'edit'; feed: Feed; onCancel: () => void };

interface FeedManagerFormProps {
  mode: FormMode;
  pending: boolean;
  disabled: boolean;
  failure: string | null;
  onChange: () => void;
  onSubmit: (draft: FeedDraft) => Promise<boolean>;
}

type FieldErrors = Record<keyof FeedDraft, string | null>;
const EMPTY_ERRORS: FieldErrors = { name: null, url: null };
const EMPTY_DRAFT: FeedDraft = { name: '', url: '' };

function validateFields(draft: FeedDraft): FieldErrors {
  const errors: FieldErrors = {
    name: draft.name.trim() ? null : 'Enter a feed name.',
    url: null,
  };
  const url = draft.url.trim();
  if (!url) {
    errors.url = 'Enter a feed URL.';
    return errors;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      errors.url = 'Enter an HTTP or HTTPS feed URL.';
    }
  } catch {
    errors.url = 'Enter a valid feed URL.';
  }
  return errors;
}

export function FeedManagerForm({ mode, pending, disabled, failure, onChange, onSubmit }: FeedManagerFormProps) {
  const [draft, setDraft] = useState<FeedDraft>(() => mode.type === 'edit'
    ? { name: mode.feed.name, url: mode.feed.url }
    : EMPTY_DRAFT);
  const [errors, setErrors] = useState<FieldErrors>(EMPTY_ERRORS);
  const nameRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const isEdit = mode.type === 'edit';

  useEffect(() => {
    if (isEdit) focusAfterUpdate(() => nameRef.current);
  }, [isEdit]);

  const changeField = (field: keyof FeedDraft, value: string) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    onChange();
    if (errors[field] && !validateFields(next)[field]) {
      setErrors(current => ({ ...current, [field]: null }));
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    const nextErrors = validateFields(draft);
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.url) {
      (nextErrors.name ? nameRef : urlRef).current?.focus();
      return;
    }
    if (await onSubmit({ name: draft.name.trim(), url: draft.url.trim() })) {
      setDraft(EMPTY_DRAFT);
      setErrors(EMPTY_ERRORS);
    }
  };

  const fields = (['name', 'url'] as const).map(field => {
    const id = mode.type === 'edit' ? `edit-feed-${field}-${mode.feed.id}` : `new-feed-${field}`;
    const errorId = mode.type === 'edit' ? `edit-feed-${field}-error-${mode.feed.id}` : `new-feed-${field}-error`;
    return (
      <div key={field}>
        <label htmlFor={id} className="block text-sm font-medium mb-1">
          {field === 'name' ? 'Feed name' : 'Feed URL'}
        </label>
        <input
          ref={field === 'name' ? nameRef : urlRef}
          id={id}
          name={`${isEdit ? 'edit-' : ''}feed-${field}`}
          type={field === 'name' ? 'text' : 'url'}
          inputMode={field === 'url' ? 'url' : undefined}
          required
          readOnly={pending}
          placeholder={field === 'name' ? 'Example News' : 'https://example.com/feed.xml'}
          value={draft[field]}
          onChange={event => changeField(field, event.target.value)}
          aria-invalid={errors[field] !== null}
          aria-describedby={errorId}
          className={`w-full ${isEdit ? 'px-3' : 'px-4'} py-2 rounded border text-base sm:text-sm`}
          style={{
            backgroundColor: 'var(--background)',
            borderColor: 'var(--control-border)',
            color: 'var(--foreground)',
          }}
        />
        <p id={errorId} className="mt-1 text-sm" style={{ color: 'var(--status-error)' }}>
          {errors[field]}
        </p>
      </div>
    );
  });

  const content = <>
    {fields}
    {failure && <p role="alert" className="text-sm" style={{ color: 'var(--status-error)' }}>{failure}</p>}
    {mode.type === 'edit' ? (
      <div className="flex gap-2 flex-wrap">
        <button
          type="submit"
          disabled={disabled}
          className="primary-action px-4 py-2 rounded text-sm font-medium button-hover-fade disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? 'Save changes…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={mode.onCancel}
          disabled={disabled}
          className="neutral-action px-4 py-2 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      </div>
    ) : (
      <button
        type="submit"
        disabled={disabled}
        className={`${mode.isEditing ? 'neutral-action' : 'primary-action'} px-6 py-2 rounded font-medium button-hover-fade disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {pending ? 'Add feed…' : 'Add feed'}
      </button>
    )}
  </>;

  return (
    <form
      onSubmit={submit}
      className={isEdit ? 'space-y-3' : 'mt-4'}
      aria-label={mode.type === 'edit' ? `Edit ${mode.feed.name}` : undefined}
      aria-busy={pending}
      noValidate
    >
      {isEdit ? content : <div className="space-y-3">{content}</div>}
    </form>
  );
}
