export function teardown() {
  console.log("🔪 [Exorcist] Global teardown: Forcefully exiting Vitest to prevent hanging.");
  setTimeout(() => process.exit(0), 500).unref();
}