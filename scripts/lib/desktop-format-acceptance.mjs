// A package-local authorization comes from a reviewed, target-specific profile.
// The profile is deliberately narrower than the source scope until that exact
// package target has run the real conversion matrix. This file binds its routes
// to the package hash and prevents a runtime engine inventory from silently
// broadening the UI.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const scopeUrl = new URL(
	"../../packaging/desktop/v1-scope.json",
	import.meta.url,
);
const profilesUrl = new URL(
	"../../packaging/desktop/format-acceptance-profiles.json",
	import.meta.url,
);

function assertPlatform(os, arch) {
	if (!["linux", "windows", "macos"].includes(os))
		throw new Error("Unsupported format acceptance OS");
	if (!["aarch64", "x86_64"].includes(arch))
		throw new Error("Unsupported format acceptance architecture");
}

export async function formatAcceptance(os, arch) {
	assertPlatform(os, arch);
	const scope = JSON.parse(await readFile(scopeUrl, "utf8"));
	if (
		scope.schema !== 1 ||
		typeof scope.id !== "string" ||
		!scope.id ||
		!Array.isArray(scope.groups)
	)
		throw new Error("Invalid reviewed format scope");
	const reviewed = new Map();
	for (const group of scope.groups) {
		if (!Array.isArray(group.inputs) || !Array.isArray(group.outputs))
			throw new Error("Invalid reviewed format route");
		for (const input of group.inputs) {
			if (
				typeof input !== "string" ||
				!input ||
				input !== input.toLowerCase() ||
				reviewed.has(input)
			)
				throw new Error(
					"Duplicate or invalid reviewed input extension",
				);
			reviewed.set(input, new Set(group.outputs));
		}
	}
	const profiles = JSON.parse(await readFile(profilesUrl, "utf8"));
	if (
		profiles.schema !== 1 ||
		profiles.scope !== scope.id ||
		!profiles.profiles ||
		!Array.isArray(profiles.targets)
	)
		throw new Error("Invalid package acceptance profiles");
	const target = profiles.targets.find(
		(candidate) => candidate?.os === os && candidate?.arch === arch,
	);
	if (!target || typeof target.profile !== "string")
		throw new Error("Missing package acceptance profile for target");
	const profile = profiles.profiles[target.profile];
	if (!profile || !Array.isArray(profile.routes))
		throw new Error("Invalid package acceptance route profile");
	const routes = [];
	const seen = new Set();
	for (const route of profile.routes) {
		if (!Array.isArray(route?.inputs) || !Array.isArray(route?.outputs))
			throw new Error("Invalid package acceptance route");
		for (const input of route.inputs) {
			if (
				typeof input !== "string" ||
				!reviewed.has(input) ||
				seen.has(input)
			)
				throw new Error(
					"Unknown or duplicate package acceptance input",
				);
			const available = reviewed.get(input);
			const outputs = [];
			for (const output of route.outputs) {
				if (
					typeof output !== "string" ||
					!available.has(output) ||
					outputs.includes(output)
				)
					throw new Error(
						"Unknown or duplicate package acceptance output",
					);
				outputs.push(output);
			}
			if (!outputs.length)
				throw new Error(
					"Package acceptance route must have output formats",
				);
			seen.add(input);
			routes.push({ input, outputs });
		}
	}
	if (!routes.length)
		throw new Error("Package acceptance profile has no routes");
	return { schema: 1, scope: scope.id, os, arch, routes };
}

export async function writeFormatAcceptance(root, os, arch) {
	const path = join(root, "format-acceptance.json");
	await writeFile(
		path,
		JSON.stringify(await formatAcceptance(os, arch), null, 2) + "\n",
		{ flag: "wx" },
	);
	return path;
}
