import type { ConfigContext, ExpoConfig } from "expo/config";
import { version } from "../package.json";

const appConfig = ({ config }: ConfigContext): ExpoConfig => ({
  ...config, name: "The Daily Feed", slug: "the-daily-feed", version,
  platforms: ["web"],
  web: { bundler: "metro" },
});

export default appConfig;
