export interface ReaderFeed {
  url: string;
  name: string;
}
export interface ReaderConfig {
  apiOrigin: string;
  feeds: ReaderFeed[];
  timeZone: string;
}
export interface PreparedArticle {
  full: string;
  preview: string;
  truncated: boolean;
}
export interface ReaderPalette {
  readonly background: string;
  readonly foreground: string;
  readonly muted: string;
  readonly subtle: string;
  readonly accent: string;
  readonly accentSolid: string;
  readonly accentForeground: string;
  readonly border: string;
  readonly controlBorder: string;
  readonly codeBackground: string;
  readonly blockquoteBorder: string;
  readonly error: string;
}
export const DEMO_FEEDS: ReaderFeed[] = [
  { url: "https://slow-journal.example/feed", name: "The Slow Journal" },
  { url: "https://field-notes.example/feed", name: "Field Notes" },
];
export const DEFAULT_CONFIG: ReaderConfig = {
  apiOrigin: "http://localhost:8787",
  feeds: DEMO_FEEDS,
  timeZone: "UTC",
};
