// Fail in the actual Vitest worker if a task silently falls back to Node.
if (!process.versions.bun) throw new Error('Application tests must execute on Bun');
export {};
