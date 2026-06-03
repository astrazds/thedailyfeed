import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import { verifyPwaBuildContract } from './pwa-build-contract';

function runCli(): void {
  const result = verifyPwaBuildContract();
  const workboxAssetNames = result.workboxAssets.map((assetPath) => basename(assetPath)).join(', ');

  console.log(
    `PWA build artifacts verified: sw.js, ${workboxAssetNames}, and ${result.feedSetRuntimeCache.route} ${result.feedSetRuntimeCache.handler} runtime route`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
