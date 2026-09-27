import { error } from "@sveltejs/kit";
import { tools, hubs } from "$lib/seo/routes.mjs";

export function entries() {
	return [...tools, ...hubs].map((entry) => ({ tool: entry.slug }));
}

export function load({ params }: { params: { tool: string } }) {
	const tool =
		tools.find((candidate) => candidate.slug === params.tool) ??
		hubs.find((candidate) => candidate.slug === params.tool);
	if (!tool) error(404, "Tool not found");
	const isHub = hubs.some((hub) => hub.slug === tool.slug);
	return {
		tool,
		isHub,
		hub: isHub
			? {
					format: "format" in tool ? tool.format : undefined,
					linksFromGroup:
						"linksFromGroup" in tool
							? tool.linksFromGroup
							: undefined,
				}
			: undefined,
	};
}
