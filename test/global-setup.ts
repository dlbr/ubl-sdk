import { execSync } from 'child_process';

export function teardown() {
  console.log("🔪 [Exorcist] Global teardown: Cleaning up zombie processes...");
  
  try {
    execSync('pkill -9 -f wrangler || true');
    execSync('pkill -9 -f esbuild || true');
  } catch (e) {}

  setTimeout(() => {
    console.log("🛑 [Exorcist] Forcefully exiting Vitest.");
    process.exit(0);
  }, 2000).unref();
}