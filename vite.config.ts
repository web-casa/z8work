import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type PluginOption } from "vite";
import svg from "@poppanator/sveltekit-svg";
import wasm from "vite-plugin-wasm";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { relative } from "node:path";

const desktopModules = new Set<string>();
const receipt = (): PluginOption => ({
	name: "desktop-module-receipt",
	generateBundle() {
		if (process.env.Z8_DESKTOP !== "1") return;
		for (const id of this.getModuleIds()) {
			if (id.startsWith(process.cwd()))
				desktopModules.add(
					relative(process.cwd(), id.split("?")[0]).replaceAll(
						"\\",
						"/",
					),
				);
		}
		mkdirSync(".desktop-local", { recursive: true });
		writeFileSync(
			".desktop-local/web-frontend-modules.json",
			JSON.stringify(
				{ schema: 1, modules: [...desktopModules].sort() },
				null,
				2,
			) + "\n",
		);
	},
});

// coollify removes the .git folder but exposes commit via SOURCE_COMMIT env variable
let commitHash = process.env.SOURCE_COMMIT
	? process.env.SOURCE_COMMIT.substring(0, 7) // shorten it lol
	: "unknown";

if (commitHash === "unknown") {
	try {
		commitHash = execSync("git rev-parse --short HEAD").toString().trim();
	} catch (e) {
		console.warn(`Could not determine Git commit hash: ${e}`);
		commitHash = "unknown";
	}
}

export default defineConfig(({ command }) => {
	const plugins: PluginOption[] = [
		receipt(),
		sveltekit(),
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/lib/paraglide",
			strategy: ["url", "baseLocale"],
		}),
		svg({
			includePaths: ["./src/lib/assets"],
			svgoOptions: {
				multipass: true,
				plugins: [
					{
						name: "preset-default",
						params: { overrides: { removeViewBox: false } },
					},
					{ name: "removeAttrs", params: { attrs: "(fill|stroke)" } },
				],
			},
		}),
	];

	if (command === "serve") {
		plugins.unshift(wasm());
	}

	return {
		plugins,
		worker: {
			plugins: () => [wasm(), receipt()],
			format: "es",
		},
		optimizeDeps: {
			// These imports are only discovered when the first image Worker starts.
			// Pre-bundle them at startup so Vite does not reload an active conversion.
			include: [
				"@imagemagick/magick-wasm",
				"vert-wasm",
				"riff-file",
				"byte-data",
			],
			// Keep MuPDF as ESM so its WASM URL stays relative to its module in dev.
			exclude: [
				"@ffmpeg/core",
				"@ffmpeg/core-mt",
				"@ffmpeg/ffmpeg",
				"@ffmpeg/util",
				"mupdf",
			],
		},
		css: {
			preprocessorOptions: {
				scss: {
					api: "modern",
				},
			},
		},
		build: {
			target: "esnext",
		},
		define: {
			__COMMIT_HASH__: JSON.stringify(commitHash),
		},
	};
});
