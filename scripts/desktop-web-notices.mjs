// Reuse the graph-based collector with the web engine feature set.
process.argv.push("--web");
await import("./desktop-notices.mjs");
