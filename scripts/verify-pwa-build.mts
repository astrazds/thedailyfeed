import { pathToFileURL } from 'node:url';

import { verifyPwaBuildContract } from './pwa-build-contract';

function runCli(): void {
  const result = verifyPwaBuildContract();

  console.log(
    `PWA build artifacts verified: sw.js and ${result.feedSetRuntimeCache.route} ${result.feedSetRuntimeCache.method} ${result.feedSetRuntimeCache.handler} runtime route`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
