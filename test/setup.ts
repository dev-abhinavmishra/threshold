// THREE warns once per material created with `map: undefined` — every decal
// canvas returns null under vitest, so the suite floods hundreds of
// thousands of lines and the workers crawl. Drop only that message.
const warn = console.warn;
console.warn = (...args: unknown[]) => {
  const head = String(args[0] ?? '');
  if (head.startsWith('THREE.Material') && head.includes("'map'")) return;
  warn(...args);
};
