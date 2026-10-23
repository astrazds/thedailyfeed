export interface ReaderConfig {
  configuredFeedCount: number;
  feeds: { url: string; name: string }[];
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
