// Translate only the native storage error grammar. Preserve unrelated diagnostics.
export function storageMessage(message: string, english: boolean): string {
	const saved: Record<string, string> = {
		"Could not retain encoded result; convert again":
			"无法保留转换结果，请重新转换",
		"Saved result expired or unavailable; convert again":
			"暂存结果已过期或不可用，请重新转换。",
		"Saved result changed or is unreadable; convert again":
			"暂存结果已改变或无法读取，请重新转换。",
		"Saved-result cache is full; convert again after saving or removing other tasks":
			"待保存结果已达到暂存上限，请先保存或移除其他任务，再重新转换。",
	};
	if (!english)
		for (const [key, translation] of Object.entries(saved)) {
			if (message.includes(key)) return message.replace(key, translation);
		}
	const match =
		/^(Temporary workspace|Output folder) has insufficient free space\. Required: ([0-9]{1,20}) bytes; available: ([0-9]{1,20}) bytes\.$/.exec(
			message,
		);
	if (match) {
		const required = BigInt(match[2]),
			available = BigInt(match[3]);
		if (
			required > 18446744073709551615n ||
			available > 18446744073709551615n
		)
			return message;
		const area =
			match[1] === "Temporary workspace"
				? english
					? "Temporary workspace"
					: "临时工作目录"
				: english
					? "Output folder"
					: "保存目录";
		// Round required up and available down; rounded numbers must not suggest
		// enough capacity when the exact byte-level comparison failed.
		const need = ((required + 1048575n) / 1048576n).toLocaleString(
			english ? "en" : "zh-Hans",
		);
		const free = (available / 1048576n).toLocaleString(
			english ? "en" : "zh-Hans",
		);
		return english
			? `${area}: at least ${need} MiB free is required; ${free} MiB is available. Free some space and retry. This is a minimum check, not an output-size estimate.`
			: `${area}空间不足：至少需要 ${need} MiB 可用空间，当前可用 ${free} MiB。请释放空间后重试。这是最低预检要求，不是结果大小估算。`;
	}
	const entries =
		/^(Temporary workspace|Output folder) has insufficient free file entries\.$/.exec(
			message,
		);
	if (entries) {
		const area =
			entries[1] === "Temporary workspace"
				? english
					? "Temporary workspace"
					: "临时工作目录"
				: english
					? "Output folder"
					: "保存目录";
		return english
			? `${area} cannot create enough files, even if byte capacity remains. Free file entries or choose another location.`
			: `${area}无法创建足够的新文件，即使仍有字节空间也不能继续。请清理无用文件或改用其他位置。`;
	}
	if (message.startsWith("Cannot write to output folder:")) {
		return english
			? `The output folder is not writable. Check its permissions or choose another folder, then retry. ${message}`
			: `保存目录无法写入。请检查权限或选择其他目录后重试。${message}`;
	}
	const query =
		/^Cannot check free space in (Temporary workspace|Output folder):/.exec(
			message,
		);
	if (query)
		return english
			? `Free space could not be checked. Check the disk connection and permissions before retrying. ${message}`
			: `无法检查可用空间。请检查磁盘连接和权限后重试。${message}`;
	return message;
}
