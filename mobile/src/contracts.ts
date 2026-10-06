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
  background: string;
  paper: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
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
