import test from "node:test";
import assert from "node:assert/strict";
import {
	createPreferences,
	defaults,
	parsePreferenceRecord,
	parsePreferences,
	preferenceLanguage,
} from "../src/platform/preferences.ts";
const record = (revision = 0, preferences = defaults()) => ({
	schema: 1,
	revision,
	preferences,
});
const tick = () => new Promise((r) => setImmediate(r));
test("desktop preferences reject file grants, future schemas and invalid options", () => {
	assert.deepEqual(parsePreferenceRecord(record()), record());
	for (const mutate of [
		(r) => (r.schema = 2),
		(r) => (r.revision = -1),
		(r) => (r.revision = Number.MAX_SAFE_INTEGER + 1),
		(r) => (r.preferences.output_path = "/private"),
		(r) => (r.preferences.language = "de"),
		(r) => (r.preferences.batch_format = "exe"),
		(r) => (r.preferences.batch_options.pdf_dpi = 300),
		(r) => (r.preferences.batch_options.quality = ["high"]),
		(r) => (r.preferences.batch_options.authorized = true),
	]) {
		const r = record();
		mutate(r);
		assert.throws(() => parsePreferenceRecord(r));
	}
});
test("system language uses primary preference, explicit selection wins", () => {
	assert.equal(preferenceLanguage("system", ["zh-TW", "en"]), "zh-Hans");
	assert.equal(preferenceLanguage("system", ["de", "zh-CN"]), "en");
	assert.equal(preferenceLanguage("system", []), "en");
	assert.equal(preferenceLanguage("en", ["zh-CN"]), "en");
	assert.equal(preferenceLanguage("zh_hans", ["en"]), "zh-Hans");
});
test("initialization never writes defaults or overwrites a slow read", async () => {
	let complete,
		writes = 0,
		latest;
	const controller = createPreferences(
		{
			read: () => new Promise((r) => (complete = r)),
			save: async () => {
				writes++;
				return record();
			},
		},
		(s) => (latest = s),
	);
	const loaded = controller.load();
	await controller.save({ ...defaults(), language: "en" });
	assert.equal(writes, 0);
	complete(record(4, { ...defaults(), language: "zh_hans" }));
	await loaded;
	assert.equal(latest.record.revision, 4);
	assert.equal(latest.draft.language, "zh_hans");
	assert.equal(latest.busy, false);
});
test("failed save retains unsaved choice, revision and explicit retry", async () => {
	let calls = 0,
		latest;
	const controller = createPreferences(
		{
			read: async () => record(3),
			save: async (revision, p) => {
				assert.equal(revision, 3);
				if (++calls === 1) throw new Error("disk full");
				return record(4, p);
			},
		},
		(s) => (latest = s),
	);
	await controller.load();
	await controller.save({ ...defaults(), language: "en" });
	assert.equal(latest.record.revision, 3);
	assert.equal(latest.pending, true);
	assert.equal(latest.draft.language, "en");
	assert.match(latest.error, /disk full/);
	await controller.save(latest.draft);
	assert.equal(latest.pending, false);
	assert.equal(latest.record.revision, 4);
});
test("ambiguous saved reply requires reload before stale retry can overwrite", async () => {
	let disk = record(),
		latest,
		writes = 0;
	const controller = createPreferences(
		{
			read: async () => disk,
			save: async (revision, p) => {
				if (revision !== disk.revision)
					throw new Error("stale revision");
				disk = record(revision + 1, p);
				writes++;
				throw new Error("reply lost");
			},
		},
		(s) => (latest = s),
	);
	await controller.load();
	await controller.save({ ...defaults(), language: "en" });
	await controller.save({ ...defaults(), language: "zh_hans" });
	assert.equal(writes, 1);
	assert.match(latest.error, /stale/);
	await controller.load();
	assert.equal(latest.draft.language, "en");
	assert.equal(latest.pending, false);
});
test("unreadable preferences never enable writes, can recover on explicit reload", async () => {
	let fail = true,
		writes = 0,
		latest;
	const controller = createPreferences(
		{
			read: async () => {
				if (fail) throw new Error("corrupt");
				return record();
			},
			save: async () => {
				writes++;
				return record();
			},
		},
		(s) => (latest = s),
	);
	await controller.load();
	await controller.save(defaults());
	assert.equal(writes, 0);
	assert.equal(latest.record, null);
	fail = false;
	await controller.load();
	assert.equal(latest.error, "");
	assert.equal(latest.record.revision, 0);
});
test("dispose suppresses late load responses and concurrent calls are ignored", async () => {
	let finish,
		published = 0,
		reads = 0;
	const controller = createPreferences(
		{
			read: () => {
				reads++;
				return new Promise((r) => (finish = r));
			},
			save: async () => record(),
		},
		() => published++,
	);
	const running = controller.load();
	await controller.load();
	assert.equal(reads, 1);
	controller.dispose();
	finish(record());
	await running;
	await tick();
	assert.equal(published, 1);
});

test("reactive proxy preferences are normalized into detached IPC data", () => {
	const options = new Proxy(defaults().batch_options, {});
	const source = { ...defaults(), batch_options: options };
	const normalized = parsePreferences(source);
	assert.deepEqual(structuredClone(normalized), defaults());
	options.pdf_dpi = 72;
	assert.equal(normalized.batch_options.pdf_dpi, 144);
});
