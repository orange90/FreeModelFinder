import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testHome = join(tmpdir(), `freemodelfinder-server-${process.pid}`);
rmSync(testHome, { recursive: true, force: true });
mkdirSync(testHome, { recursive: true, mode: 0o700 });
process.env.FREEMODELFINDER_HOME = testHome;
process.env.LOG_LEVEL = 'silent';

process.once('exit', () => {
  rmSync(testHome, { recursive: true, force: true });
});
