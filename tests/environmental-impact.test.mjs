import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function loadUtility(name) {
	const source = await readFile(
		new URL(`../src/lib/util/${name}.ts`, import.meta.url),
		"utf8",
	);
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.ESNext,
			target: ts.ScriptTarget.ES2022,
		},
	});
	return import(
		`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
	);
}
const {
	estimateStorage,
	estimateGlobal,
	imageSaving,
	summarizeImageSavings,
	formatCarbon,
} = await loadUtility("environmental-impact");
const { usesOnlyLocalConverters } = await loadUtility("conversion-privacy");
const close = (actual, expected) =>
	assert.ok(
		Math.abs(actual - expected) <
			Math.max(1e-12, Math.abs(expected) * 1e-12),
		`${actual} != ${expected}`,
	);

function file(inputBytes, outputBytes, overrides = {}) {
	return {
		file: { size: inputBytes },
		from: ".png",
		result:
			outputBytes === null
				? null
				: { file: { size: outputBytes }, to: ".webp" },
		findConverter: () => ({ name: "imagemagick" }),
		...overrides,
	};
}

test("1 MB for one year uses decimal units and yields milligrams, not grams or kilograms", () => {
	const result = estimateStorage(1_000_000);
	close(result.kWh, 0.000005694);
	close(result.gramsCO2, 0.00247689);
	assert.equal(formatCarbon(result.gramsCO2, "en"), "2.48 mg CO₂");
	close(estimateStorage(1e12).kWh, 5.694);
});

test("zero size and zero duration estimate no operational impact; invalid inputs are rejected", () => {
	assert.deepEqual(estimateStorage(0), { kWh: 0, gramsCO2: 0 });
	assert.deepEqual(estimateStorage(1e9, 0), { kWh: 0, gramsCO2: 0 });
	for (const value of [-1, NaN, Infinity]) {
		assert.throws(() => estimateStorage(value), RangeError);
		assert.throws(() => estimateStorage(1, value), RangeError);
		assert.throws(() => estimateGlobal(value), RangeError);
	}
	assert.throws(() => estimateStorage(1, 365, "unknown"), RangeError);
});

test("global daily savings accumulate with distinct retention periods over the first year", () => {
	const result = estimateGlobal(1);
	assert.equal(result.dailyBytes, 6e15);
	assert.equal(result.yearEndBytes, 2.19e18);
	// Independently sum 365 daily cohorts instead of duplicating the closed form.
	let expected = 0;
	for (let day = 1; day <= 365; day++)
		expected += estimateStorage(6e15, day).kWh;
	close(result.kWh, expected);
	close(result.kWh, 6_252_012);
	close(result.gramsCO2, 2_719_625_220);
	assert.ok(result.kWh < estimateStorage(result.yearEndBytes).kWh);
	close(estimateGlobal(2).kWh, result.kWh * 2);
});

test("the SSD scenario changes only the published power coefficient", () => {
	close(estimateStorage(1e12, 365, "ssd").kWh, 10.512);
	close(
		estimateGlobal(1, "ssd").kWh,
		(estimateGlobal(1, "hdd").kWh * 1.2) / 0.65,
	);
});

test("image savings use the actual output size and exclude archives and other converters", () => {
	assert.deepEqual(imageSaving(file(1000, 400)), {
		inputBytes: 1000,
		outputBytes: 400,
		savedBytes: 600,
	});
	assert.equal(imageSaving(file(1000, null)), null);
	assert.equal(imageSaving(file(1000, 200, { from: ".zip" })), null);
	assert.equal(
		imageSaving(
			file(1000, 200, { result: { file: { size: 200 }, to: ".zip" } }),
		),
		null,
	);
	assert.equal(
		imageSaving(
			file(1000, 200, { findConverter: () => ({ name: "pandoc" }) }),
		),
		null,
	);
	assert.equal(imageSaving(file(1000, 0)), null);
	assert.equal(imageSaving(file(NaN, 200)), null);
	for (const flag of ["processing", "queued", "cancelled", "failed"]) {
		assert.equal(imageSaving(file(1000, 200, { [flag]: true })), null);
	}
});

test("larger outputs offset savings; no positive carbon claim for a net increase", () => {
	const reduced = file(1000, 500);
	const enlarged = file(1000, 1800);
	assert.equal(imageSaving(enlarged).savedBytes, -800);
	assert.deepEqual(summarizeImageSavings([reduced, enlarged]), {
		count: 2,
		savedBytes: -300,
		kWh: 0,
		gramsCO2: 0,
	});
	assert.equal(
		summarizeImageSavings([file(1000, 500), file(1000, 1200)]).savedBytes,
		300,
	);
});

test("reconversion replaces a result, while removal and cancellation remove its contribution", () => {
	const item = file(1000, 600);
	assert.equal(summarizeImageSavings([item]).savedBytes, 400);
	assert.equal(summarizeImageSavings([item]).savedBytes, 400);
	item.result = null;
	assert.equal(summarizeImageSavings([item]).savedBytes, 0);
	item.result = { file: { size: 800 }, to: ".avif" };
	assert.equal(summarizeImageSavings([item]).savedBytes, 200);
	assert.deepEqual(summarizeImageSavings([]), {
		count: 0,
		savedBytes: 0,
		kWh: 0,
		gramsCO2: 0,
	});
});

test("carbon labels retain tiny values and switch units without calling CO2 CO2e", () => {
	assert.equal(formatCarbon(0, "en"), "0 g CO₂");
	assert.equal(formatCarbon(0.0000001, "en"), "< 0.01 mg CO₂");
	assert.equal(formatCarbon(0.5, "en"), "500 mg CO₂");
	assert.equal(formatCarbon(1500, "en"), "1.5 kg CO₂");
	assert.equal(formatCarbon(1500000, "en"), "1.5 t CO₂");
});

test("the zero file-upload claim is available only for an explicit all-local registry", () => {
	assert.equal(
		usesOnlyLocalConverters([{ processingLocation: "local" }]),
		true,
	);
	assert.equal(
		usesOnlyLocalConverters([
			{ processingLocation: "local" },
			{ processingLocation: "remote" },
		]),
		false,
	);
	assert.equal(
		usesOnlyLocalConverters([{ processingLocation: "unknown" }]),
		false,
	);
	assert.equal(usesOnlyLocalConverters([{}]), false);
	assert.equal(usesOnlyLocalConverters([]), false);
});
