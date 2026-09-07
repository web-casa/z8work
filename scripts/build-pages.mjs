import { spawnSync } from "node:child_process";
import { preparePages } from "./prepare-pages.mjs";

// Supply every public import on a clean Git build without needing a private .env.
const env = {
	PUB_HOSTNAME: "z8.work",
	PUB_PLAUSIBLE_URL: "",
	PUB_VERTD_URL: "",
	PUB_DISABLE_ALL_EXTERNAL_REQUESTS: "false",
	PUB_DISABLE_FAILURE_BLOCKS: "false",
	...process.env,
	PUB_ENV: "production",
};
const build = spawnSync("npm", ["run", "build"], { stdio: "inherit", env });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status || 1);
const assets = await preparePages("build", "build-pages");
for (const [path, asset] of Object.entries(assets))
	console.log(
		`Pages: ${path} → ${(asset.size / 1024 / 1024).toFixed(2)} MiB gzip`,
	);
