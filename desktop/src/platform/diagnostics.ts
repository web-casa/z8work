export type DiagnosticPreview = { id: string; text: string };
export function parseDiagnosticPreview(value: unknown): DiagnosticPreview {
	if (!value || typeof value !== "object")
		throw new Error("Invalid diagnostic report");
	const { id, text } = value as Record<string, unknown>;
	if (
		typeof id !== "string" ||
		!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id) ||
		typeof text !== "string" ||
		new TextEncoder().encode(text).length > 8192
	)
		throw new Error("Invalid diagnostic report");
	const report = JSON.parse(text);
	if (report?.schema !== 1 || report?.product !== "Z8.Work")
		throw new Error("Unsupported diagnostic report");
	return { id, text };
}
