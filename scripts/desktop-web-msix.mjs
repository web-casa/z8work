// Layout only: does not build, sign, install or submit a package.
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { prepareWebMsix } from "./lib/desktop-web-msix.mjs";
const { values } = parseArgs({
	options: {
		payload: { type: "string" },
		output: { type: "string" },
		config: {
			type: "string",
			default: "packaging/desktop-web/microsoft-store.json",
		},
		arch: { type: "string" },
		"source-commit": { type: "string" },
	},
});
if (
	!values.payload ||
	!values.output ||
	!["x64", "arm64"].includes(values.arch)
)
	throw Error(
		"Use --payload CLEAN_DIRECTORY --output NEW_DIRECTORY --arch x64|arm64 --source-commit FULL_SHA [--config FILE]",
	);
const config = JSON.parse(await readFile(values.config, "utf8"));
config.architecture = values.arch;
if (values.arch === "arm64")
	config.minimumWindowsVersion = config.maxVersionTested = "10.0.22000.0";
const receipt = await prepareWebMsix({
	payload: values.payload,
	output: values.output,
	config,
	sourceCommit: values["source-commit"],
});
console.log(
	JSON.stringify(
		{
			status: "layout-prepared",
			storeSubmissionAllowed: false,
			config: receipt.config,
			pending: receipt.pending,
		},
		null,
		2,
	),
);
