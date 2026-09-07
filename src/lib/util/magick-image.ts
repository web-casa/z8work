import {
	AlphaAction,
	ColorProfile,
	ColorSpace,
	ColorType,
	CompressionMethod,
	MagickColors,
	MagickFormat,
	MagickImage,
	MagickImageCollection,
	MagickReadSettings,
	Quantum,
	type IMagickImage,
} from "@imagemagick/magick-wasm";
import { configureAvifOutput } from "./magick-avif";
import { normalizeImageQuality } from "./image-quality";
import { srgbProfileBytes } from "../assets/profiles/srgb";

const srgbProfile = new ColorProfile(srgbProfileBytes);

function formatName(extension: string): MagickFormat {
	const format = extension.replace(/^\./, "").toUpperCase();
	return ({ JPG: "JPEG", JPE: "JPEG", JFIF: "JPEG", FIT: "FITS" }[format] ??
		format) as MagickFormat;
}

export function readImageCollection(bytes: Uint8Array, from: string) {
	const collection = MagickImageCollection.create();
	try {
		// ICO in this WASM build requires an explicit decoder.
		collection.read(
			bytes,
			new MagickReadSettings({ format: formatName(from) }),
		);
		return collection;
	} catch (error) {
		collection.dispose();
		throw error;
	}
}

export function configureImageOutput(
	image: IMagickImage,
	to: string,
	keepMetadata: boolean,
	quality?: number,
): void {
	const format = formatName(to);
	// Bake orientation into pixels before dropping EXIF or writing a format
	// whose viewer may not understand the source's orientation metadata.
	image.autoOrient();
	image.quality = normalizeImageQuality(quality);
	if (!keepMetadata) {
		// Removing an ICC profile without converting its pixels changes colors.
		// Convert while the source profile is still available, then remove it.
		if (image.getColorProfile()) image.transformColorSpace(srgbProfile);
		else if (
			image.colorSpace !== ColorSpace.sRGB &&
			image.colorSpace !== ColorSpace.Gray
		)
			image.colorSpace = ColorSpace.sRGB;
		image.strip();
	}
	// Source depth can describe palette indices or exceed the WASM quantum depth.
	// Keep valid packed TIFF samples only when the decoded RGB/alpha channels fit.
	const preserveTiffDepth =
		(format === MagickFormat.Tiff || format === MagickFormat.Tif) &&
		image.depth < 8 &&
		image.determineBitDepth() <= image.depth;
	image.depth = Math.min(
		Quantum.depth,
		Math.max(preserveTiffDepth ? image.depth : 8, image.depth),
	);
	if (format === MagickFormat.Avif) {
		// AOM's slow defaults are unsuitable for interactive, single-thread WASM.
		image.settings.setDefine("heic:speed", "6");
		configureAvifOutput(image);
	} else if (format === MagickFormat.Png) {
		// PNG quality is a zlib level/filter code, not a visual quality percentage.
		// Level 6 keeps the decoded pixels intact without level 9's long searches.
		image.settings.setDefine("png:compression-level", "6");
		image.settings.setDefine("png:compression-filter", "5");
	} else if (format === MagickFormat.Tiff || format === MagickFormat.Tif) {
		image.settings.compression = CompressionMethod.Zip;
	} else if (format === MagickFormat.Psd && image.hasAlpha) {
		// PSD cannot store semi-transparent palette entries. Expand the palette
		// instead of emitting an invalid indexed PSD with an extra alpha channel.
		if (
			[
				ColorType.Palette,
				ColorType.PaletteAlpha,
				ColorType.PaletteBilevelAlpha,
			].some((type) => type === image.colorType)
		)
			image.colorType = ColorType.TrueColorAlpha;
	} else if (format === MagickFormat.WebP && image.quality === 100) {
		// Lossless editing exports should also retain RGB under fully transparent pixels.
		image.settings.setDefine("webp:exact", "true");
	} else if (format === MagickFormat.Jpeg && image.hasAlpha) {
		// JPEG has no alpha: discard neither transparency nor its edge blending.
		// Alpha removal reads channels in the source color space. Transform one
		// white pixel so CMYK, Lab and RGB agree on the background color.
		const background = MagickImage.create(MagickColors.White, 1, 1);
		try {
			background.colorSpace = image.colorSpace;
			background.getPixels((pixels) => {
				image.backgroundColor = pixels.getColor(0, 0)!;
			});
		} finally {
			background.dispose();
		}
		image.alpha(AlphaAction.Remove);
	}
}

export function writeImage(
	image: IMagickImage,
	to: string,
	keepMetadata: boolean,
	quality?: number,
): Uint8Array {
	const format = formatName(to);
	if (
		format === MagickFormat.Ico &&
		Math.max(image.width, image.height) > 256
	) {
		const scale = 256 / Math.max(image.width, image.height);
		image.resize(
			Math.max(1, Math.round(image.width * scale)),
			Math.max(1, Math.round(image.height * scale)),
		);
	}
	configureImageOutput(image, to, keepMetadata, quality);
	return image.write(format, (bytes) => new Uint8Array(bytes));
}

/** The shared still/animation path, also exercised against the actual WASM in tests. */
export function convertImage(
	bytes: Uint8Array,
	from: string,
	to: string,
	keepMetadata: boolean,
	quality?: number,
	onEncoding?: () => void,
): Uint8Array {
	const animated = [".webp", ".gif"];
	if (animated.includes(from) && animated.includes(to)) {
		const collection = readImageCollection(bytes, from);
		try {
			// GIF frames may be partial rectangles. WebP needs their rendered canvas.
			collection.coalesce();
			for (const frame of collection)
				configureImageOutput(frame, to, keepMetadata, quality);
			onEncoding?.();
			return collection.write(
				formatName(to),
				(output) => new Uint8Array(output),
			);
		} finally {
			collection.dispose();
		}
	}
	const image = MagickImage.create(
		bytes,
		new MagickReadSettings({
			format: formatName(from),
			frameIndex: 0,
			frameCount: 1,
		}),
	);
	try {
		onEncoding?.();
		return writeImage(image, to, keepMetadata, quality);
	} finally {
		image.dispose();
	}
}
