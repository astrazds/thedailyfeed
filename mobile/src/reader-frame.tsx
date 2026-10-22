import { activityOf, type FeedLoadActivity } from "../../lib/feed-load-activity";
import type { FeedSetPhase, FeedStatus } from "../../lib/feed-set-lifecycle";
import type { FeedItem } from "../../lib/types";

declare const editionInstantBrand: unique symbol;

export type EditionInstant = Date & { readonly [editionInstantBrand]: true };

export function editionInstant(value: Date): EditionInstant {
  return value as EditionInstant;
}

export type ArticlePlaceholder = { readonly slot: 0 | 1 | 2 };
export type LoadingShell = readonly [ArticlePlaceholder, ArticlePlaceholder, ArticlePlaceholder];

export type ReaderHeaderModel = {
  readonly editionStartedAt: EditionInstant;
  readonly timeZone: string;
  readonly itemCount: number;
  readonly showCached: boolean;
  readonly refreshEnabled: boolean;
  readonly storageNotice: string | null;
};

export type ReaderFrame =
  | {
      kind: "loading";
      header: ReaderHeaderModel;
      placeholders: LoadingShell;
      articles: readonly FeedItem[];
      activity: FeedLoadActivity;
      feedStatuses: readonly FeedStatus[];
      failureMessage: null;
    }
  | {
      kind: "settled";
      header: ReaderHeaderModel;
      articles: readonly FeedItem[];
      activity: FeedLoadActivity;
      feedStatuses: readonly FeedStatus[];
      failureMessage: string | null;
    };

const LOADING_SHELL: LoadingShell = [{ slot: 0 }, { slot: 1 }, { slot: 2 }];

function articlesOf(phase: FeedSetPhase): readonly FeedItem[] {
  return phase.kind === "no-feeds" ? [] : phase.items;
}

function statusesOf(phase: FeedSetPhase): readonly FeedStatus[] {
  return phase.kind === "no-feeds" ? [] : phase.feedStatuses;
}

function showCached(phase: FeedSetPhase): boolean {
  return phase.kind === "ready" || phase.kind === "partial" || phase.kind === "interrupted"
    ? phase.cached
    : false;
}

export function readerFrame(input: {
  phase: FeedSetPhase;
  editionStartedAt: EditionInstant;
  configuredFeedCount: number;
  timeZone: string;
}): ReaderFrame {
  const articles = articlesOf(input.phase);
  const activity = activityOf(input.phase, input.configuredFeedCount);
  const header: ReaderHeaderModel = {
    editionStartedAt: input.editionStartedAt,
    timeZone: input.timeZone,
    itemCount: articles.length,
    showCached: showCached(input.phase),
    refreshEnabled: input.phase.kind !== "loading" && input.phase.kind !== "no-feeds",
    storageNotice: null,
  };
  const feedStatuses = statusesOf(input.phase);
  const failureMessage = input.phase.kind === "failed" ? input.phase.message : null;
  if (input.phase.kind === "loading") {
    return {
      kind: "loading",
      header,
      placeholders: LOADING_SHELL,
      articles,
      activity,
      feedStatuses,
      failureMessage: null,
    };
  }
  return {
    kind: "settled",
    header,
    articles,
    activity,
    feedStatuses,
    failureMessage,
  };
}
