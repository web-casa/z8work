import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { relative, sep } from "node:path";

export default defineConfig({
	root: fileURLToPath(new URL(".", import.meta.url)),
	plugins: [
		svelte({ configFile: false }),
		{
			name: "desktop-build-module-receipt",
			apply: "build",
			generateBundle() {
				const root = fileURLToPath(new URL("../", import.meta.url));
				const output = fileURLToPath(
					new URL("../.desktop-local/", import.meta.url),
				);
				mkdirSync(output, { recursive: true });
				writeFileSync(
					output + "frontend-modules.json",
					JSON.stringify(
						{
							schema: 1,
							modules: [...this.getModuleIds()]
								.filter((id) => !id.startsWith("\0"))
								.map((id) =>
									relative(root, id.split("?")[0])
										.split(sep)
										.join("/"),
								)
								.sort(),
						},
						null,
						2,
					) + "\n",
				);
			},
		},
	],
	clearScreen: false,
	server: { host: "127.0.0.1", port: 1420, strictPort: true },
	build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
});
