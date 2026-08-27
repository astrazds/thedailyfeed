import { pathToFileURL } from 'node:url';

import { verifyPwaBuildContract } from './pwa-build-contract';

function runCli(): void {
  const result = verifyPwaBuildContract();

  console.log(
    `PWA build artifacts verified: sw.js, ${result.feedSetRuntimeCache.route} ${result.feedSetRuntimeCache.method} ${result.feedSetRuntimeCache.handler}, and bounded ${result.remoteImageRuntimeCache.handler} cross-origin image runtime routes`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
