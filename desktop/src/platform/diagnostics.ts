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

export function diagnosticError(error: string, english: boolean): string {
	if (error === "Preview this diagnostic report again before saving")
		return english
			? "Preview this diagnostic report again before saving."
			: "请重新生成并查看诊断报告，再保存。";
	if (error === "Close the current dialog first")
		return english
			? "Close the current dialog, then try again."
			: "请先关闭当前对话框，再重试。";
	return english
		? "The diagnostic report action failed. You can try again."
		: "诊断报告操作失败，可以重试。";
}
