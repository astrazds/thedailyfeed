import type { ConfigContext, ExpoConfig } from "expo/config";
import { version } from "../package.json";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config, name: "The Daily Feed", slug: "the-daily-feed", version,
});
