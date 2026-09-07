import { error } from "@sveltejs/kit";
import { tools } from "$lib/seo/routes.mjs";

export function entries() {
	return tools.map((tool) => ({ tool: tool.slug }));
}

export function load({ params }: { params: { tool: string } }) {
	const tool = tools.find((candidate) => candidate.slug === params.tool);
	if (!tool) error(404, "Tool not found");
	return { tool };
}
