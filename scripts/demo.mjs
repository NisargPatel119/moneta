// Runs Moneta with made-up demo data: no Plaid, database or password needed.
//   npm run demo            → http://localhost:3001
//   PORT=4000 npm run demo  → a different port
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const port = process.env.PORT || '3001';

const child = spawn(process.execPath, [nextBin, 'dev', '--port', port], {
  stdio: 'inherit',
  env: { ...process.env, DEMO_MODE: 'true' },
});
child.on('exit', code => process.exit(code ?? 0));
