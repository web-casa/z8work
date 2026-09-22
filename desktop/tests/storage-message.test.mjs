import test from "node:test";
import assert from "node:assert/strict";
import { storageMessage } from "../src/platform/storage-message.ts";

test("storage diagnostics distinguish locations and round capacity conservatively", () => {
	const error =
		"Temporary workspace has insufficient free space. Required: 16777217 bytes; available: 16777216 bytes.";
	assert.match(
		storageMessage(error, true),
		/at least 17 MiB.*16 MiB.*minimum check/,
	);
	assert.match(
		storageMessage(error, false),
		/临时工作目录.*17 MiB.*16 MiB.*不是结果大小估算/,
	);
	assert.match(
		storageMessage(
			error.replace("Temporary workspace", "Output folder"),
			false,
		),
		/保存目录/,
	);
});
test("u64 storage diagnostics are handled without unsafe number coercion", () => {
	const value =
		"Output folder has insufficient free space. Required: 18446744073709551615 bytes; available: 0 bytes.";
	assert.match(storageMessage(value, true), /17,592,186,044,416 MiB/);
	assert.equal(
		storageMessage(
			value.replace("18446744073709551615", "18446744073709551616"),
			true,
		),
		value.replace("18446744073709551615", "18446744073709551616"),
	);
});
test("file-entry exhaustion and permission errors offer actionable localized recovery", () => {
	assert.match(
		storageMessage(
			"Output folder has insufficient free file entries.",
			false,
		),
		/即使仍有字节空间/,
	);
	assert.match(
		storageMessage("Cannot write to output folder: denied", false),
		/检查权限.*denied/,
	);
	assert.match(
		storageMessage(
			"Cannot check free space in Temporary workspace: offline",
			true,
		),
		/disk connection.*offline/,
	);
});
test("unrelated or malformed errors pass through as text", () => {
	for (const value of [
		"Cancelled",
		"<b>disk</b>",
		"x Output folder has insufficient free file entries.",
		"Output folder has insufficient free space. Required: -1 bytes; available: 0 bytes.",
	])
		assert.equal(storageMessage(value, false), value);
});
