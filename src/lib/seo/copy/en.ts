import type { SeoCopy } from "$lib/seo/copy-types";

export const en: SeoCopy = {
	home: "Local file conversion, in your browser",
	description:
		"Convert images, audio and documents in batches. Export PDF pages as images and use WebP or AVIF. Files stay in your browser; no file uploads.",
	directory: "Choose a conversion",
	guide: "How to use this tool",
	notes: "Quality and format notes",
	related: "More local tools",
	languages: "Languages",
	faq: "Frequently asked questions",
	hubFrom: "Convert from {name}",
	hubTo: "Convert to {name}",
	otherConverters: "Other converters",

	formatGuides: "Format guides",
	picker: {
		from: "Convert from",
		to: "to",
		browse: "Browse all conversion tools",
		toControl: "Target format",
	},
	groups: {
		image: "Images",
		audio: "Audio",
		video: "Video to audio",
		doc: "Documents",
		pdf: "PDF",
	},
	steps: [
		"Choose files or drag them into the workspace. Matching inputs get the output format shown on this page.",
		"Check the output format and image quality for each file. Existing files in your queue keep their settings.",
		"Start the conversion, then download individual results or the completed batch. Your original files are unchanged.",
	],
	stepsHub: [
		"Add files or drag them into the workspace. Nothing is uploaded; processing happens in your browser.",
		"Choose an output format — and for images and audio, a quality level — for each file. Nothing is preselected on this page.",
		"Start the conversion, then download individual results or the completed batch.",
	],
	pages: {
		"/tools/": [
			"All conversion tools",
			"Browse every local conversion: image, audio, video-to-audio and document tools, plus format guides. Files stay in your browser.",
		],
		"/about/": [
			"About Z8.Work",
			"An open-source file converter based on VERT. Learn about browser processing, supported conversions and the project source code.",
		],
		"/privacy/": [
			"Privacy and local processing",
			"How Z8.Work processes files locally, what the 0 B upload indicator means, and which website resources still use the network.",
		],
		"/environment/": [
			"Image compression and storage impact",
			"Understand image size savings and conditional storage carbon estimates, including the assumptions, sources and limits of the calculation.",
		],
		"/acknowledgements/": [
			"Thank you, VERT.SH",
			"Thank you to the VERT.SH project and all its developers. Z8.Work stands on the shoulders of giants. Find our source code and contact email.",
		],
		"/settings/": [
			"Conversion settings",
			"Adjust image quality, audio output, appearance and local engine cache settings.",
		],
		"/convert/": [
			"Conversion workspace",
			"Manage your local file queue, choose output formats, convert and download results.",
		],
	},
	tools: {
		"heic-to-jpg": {
			title: "HEIC to JPG converter",
			intro: "Convert HEIC and HEIF photos to JPG in your browser, individually or in batches. No photo uploads.",
			detail: "JPG is useful for photo attachments and services that do not accept HEIC. This page selects JPG for HEIC/HEIF inputs; the original photos remain on your device. JPG uses lossy compression, so higher quality can produce larger files.",
			tip: "JPG does not support transparency. For transparent artwork, choose PNG or WebP instead. Some HEIC variants may not decode; keep the original and try a different export from the source device if conversion fails.",
			faqs: [
				{
					q: "Will converting HEIC to JPG reduce photo quality?",
					a: "JPG discards some image data when encoding. At balanced quality the difference is rarely visible, and the workspace reports each file's size change. Your original HEIC photos are never modified.",
				},
				{
					q: "Why do some iPhone photos fail to convert?",
					a: "A few HEIC encoding variants, such as some HDR or burst-mode exports, may not decode in the browser. Keep the original and re-export the photo from the device that took it, then try again.",
				},
				{
					q: "Do I need to install anything?",
					a: "No. Conversion runs in your browser using WebAssembly; the conversion engine downloads on first use and is cached afterwards. Photos are processed on your device and never uploaded.",
				},
			],
		},
		"png-to-webp": {
			title: "PNG to WebP converter",
			intro: "Convert PNG images to WebP locally. Batch-process screenshots and web graphics without uploading the originals.",
			detail: "WebP supports transparency and can reduce the size of many PNG images. Balanced quality is a useful starting point for web images; compare fine text and edges before choosing a lower quality setting.",
			tip: "A smaller result is not guaranteed, especially for tiny or already optimized images. The workspace reports the actual size change. Choose the lossless quality mode when exact decoded pixels matter.",
			faqs: [
				{
					q: "Is WebP always smaller than PNG?",
					a: "No. Small images, icons and PNGs that were already optimized can come out the same size or larger. Check the actual size change the workspace shows for each file.",
				},
				{
					q: "Does WebP keep transparency?",
					a: "Yes. Both lossy and lossless WebP support an alpha channel, so transparent areas in your PNG survive the conversion.",
				},
				{
					q: "Which quality setting should I choose?",
					a: "Start with balanced quality for web graphics. If the image contains small text or fine edges, inspect those areas at full size before lowering quality; use lossless when pixels must match exactly.",
				},
			],
		},
		"png-to-avif": {
			title: "PNG to AVIF converter",
			intro: "Create AVIF images from PNG files in your browser. Adjust quality and compare the resulting file size before downloading.",
			detail: "AVIF supports transparency and efficient lossy compression, but encoding can take longer than WebP. For photos and detailed images, begin with balanced quality and inspect the result at its intended display size.",
			tip: "AVIF can be larger than the original when lossless or maximum quality is selected, or when the image is small or unusually simple. Quality numbers are not directly comparable between formats; compare both appearance and actual bytes.",
			faqs: [
				{
					q: "AVIF or WebP — which should I choose?",
					a: "AVIF usually reaches smaller files at the same visual quality but encodes more slowly; WebP is faster and supported slightly more widely. Convert one image to both and compare the reported sizes.",
				},
				{
					q: "Why is my AVIF larger than the PNG?",
					a: "Lossless or maximum-quality AVIF, very small images and extremely simple graphics can all produce a larger file. Lower the quality or keep the PNG when the result is not smaller.",
				},
				{
					q: "Can every device display AVIF?",
					a: "All current major browsers can, but some older editors, apps and operating systems cannot. Keep the original PNG if the image must open everywhere.",
				},
			],
		},
		"pdf-to-png": {
			title: "PDF to PNG converter",
			intro: "Render PDF pages as PNG images locally. Download one page directly or multiple pages together in a numbered ZIP.",
			detail: "Pages are rendered at 144 DPI. PNG avoids additional lossy image compression and is useful for text, diagrams and screenshots. This is a rendered image export, not OCR or extraction of editable document text.",
			tip: "The current PDF limits include 200 pages and 100 MiB of input; page dimensions, output size and available memory also apply. Password-protected PDFs are not supported. Use JPG or WebP if PNG page images are too large.",
			faqs: [
				{
					q: "What resolution are the page images?",
					a: "Pages render at 144 DPI, which is comfortably readable for text and diagrams. There is currently no setting to change the render resolution.",
				},
				{
					q: "Can I extract the text from my PDF?",
					a: "No. This tool produces images of the pages; the text becomes pixels and is not selectable or searchable. It does not perform OCR.",
				},
				{
					q: "Why is my PDF rejected?",
					a: "The most common causes are documents over 200 pages, files over 100 MiB, and password-protected PDFs. Very large page dimensions can also exceed the browser's memory.",
				},
			],
		},
		"pdf-to-jpg": {
			title: "PDF to JPG converter",
			intro: "Convert PDF pages to JPG images in your browser. Export a single page or download a numbered ZIP for a multi-page document.",
			detail: "The tool renders pages at 144 DPI, then encodes them as JPG. JPG is useful for sharing photographic pages; compression may introduce artifacts around small text. Adjust image quality before converting.",
			tip: "JPG cannot preserve transparency; transparent areas are flattened onto white. Choose PNG for crisp diagrams. Password-protected PDFs are unsupported, and the PDF page, memory and output limits still apply.",
			faqs: [
				{
					q: "Which quality should I pick for JPG pages?",
					a: "Balanced quality suits most documents. If pages are mostly photographs, higher quality is usually worth the larger files; for text-heavy pages, PNG avoids compression artifacts entirely.",
				},
				{
					q: "Why is my page background white instead of transparent?",
					a: "JPG has no transparency support. Any transparent areas are flattened onto white. Convert to PNG instead when you need transparent backgrounds.",
				},
				{
					q: "Can I convert only some pages?",
					a: "Yes. After rendering, download just the pages you need individually; the numbered ZIP is optional. The 200-page and 100 MiB input limits still apply to the document itself.",
				},
			],
		},
		"image-compressor": {
			title: "Batch image compressor",
			intro: "Reduce image file sizes locally and compare the actual savings. This tool starts with WebP output; you can change the format and quality.",
			detail: "Add JPG, PNG, WebP, AVIF or TIFF images, then choose quality appropriate for their use. Photos, screenshots and icons compress differently. Inspect fine detail before replacing an original with a smaller result.",
			tip: "Re-encoding does not always save space. Z8.Work shows both reductions and increases; it does not claim every conversion is smaller. Storage carbon figures are conditional estimates, not measured net emissions avoided.",
			faqs: [
				{
					q: "How much smaller will my images get?",
					a: "It depends on the format, dimensions and content. Photos usually shrink the most; already-optimized or tiny images may not shrink at all. The workspace reports the real numbers per file instead of promising a percentage.",
				},
				{
					q: "Which output format should I choose?",
					a: "WebP is a good default for the web, AVIF often reaches the smallest sizes, and JPG remains the safest choice when compatibility matters more than bytes. Change the format per file in the workspace.",
				},
				{
					q: "Is compression reversible?",
					a: "No. Lossy re-encoding discards data permanently. Keep the original files; the compressed copies are for publishing and sharing.",
				},
			],
		},
		"webp-to-png": {
			title: "WebP to PNG converter",
			intro: "Convert WebP images to PNG locally, in batches. Ideal for editors and upload forms that still expect PNG.",
			detail: "PNG is accepted almost everywhere images can be uploaded, while some older editors and form validators still reject WebP. Conversion decodes the WebP and re-encodes lossless PNG; transparency is preserved.",
			tip: "PNG files are usually larger than the WebP originals — that is expected, not a bug. If a WebP was saved at low quality, compression artifacts remain visible in the PNG; conversion cannot undo them.",
			faqs: [
				{
					q: "Does converting WebP to PNG lose quality?",
					a: "No further quality is lost. The WebP decodes to exact pixels and PNG stores them losslessly. Any softness or artifacts you see came from the original lossy WebP encoding.",
				},
				{
					q: "Why did my file get bigger?",
					a: "PNG's lossless compression is less efficient than lossy WebP, especially for photographs. Size growth is normal when moving to a lossless format.",
				},
				{
					q: "Is transparency preserved?",
					a: "Yes. WebP alpha channels carry over to PNG exactly. If you convert to JPG instead, transparency would flatten onto white.",
				},
			],
		},
		"jpg-to-png": {
			title: "JPG to PNG converter",
			intro: "Convert JPG photos to PNG in your browser, in batches, with no uploads.",
			detail: "PNG re-encodes the decoded JPG pixels without adding new compression artifacts and supports transparency, which JPG lacks. It suits images headed for further editing, where repeated JPG saves would gradually degrade quality.",
			tip: "The PNG result will not look better than the JPG source — conversion cannot reverse JPG compression. Expect noticeably larger files, particularly for photographs.",
			faqs: [
				{
					q: "Does JPG to PNG improve image quality?",
					a: "No. The pixels are exactly what the JPG decoded to. PNG prevents further loss in later editing steps but cannot restore detail the JPG encoding already discarded.",
				},
				{
					q: "When is converting to PNG worth it?",
					a: "Before image editing that saves the file repeatedly, when a transparent background is required, or when an application or form accepts only PNG input.",
				},
				{
					q: "Why is the PNG so much larger than my JPG?",
					a: "Photographs compress poorly in lossless formats. PNG stores every pixel exactly, which costs space; JPG stays small precisely by discarding data.",
				},
			],
		},
		"png-to-jpg": {
			title: "PNG to JPG converter",
			intro: "Convert PNG images to JPG locally. Shrink screenshots and exports for email, forms and storage.",
			detail: "JPG's lossy compression often cuts PNG file sizes dramatically, which helps with size-limited uploads and photo storage. The trade-offs: transparency is lost, with transparent areas flattening onto white, and quality loss you control with the quality setting.",
			tip: "Keep PNG for line art, screenshots with small text, or images needing transparency — JPG can blur sharp edges and ring around text. The workspace reports the actual size change per file.",
			faqs: [
				{
					q: "What happened to my transparent background?",
					a: "JPG has no alpha channel, so transparent areas are flattened onto white. Convert to WebP if you need smaller files that keep transparency.",
				},
				{
					q: "Which quality setting should I use?",
					a: "Around 80–90 suits most screenshots and graphics. Lower values shrink files further but blur edges; check small text and sharp borders before settling on a setting.",
				},
				{
					q: "Why does text in my JPG look fuzzy?",
					a: "JPG compression is designed for photographs. Hard edges, such as text and UI elements, develop visible artifacts. PNG remains the better choice for screenshots.",
				},
			],
		},
		"webp-to-jpg": {
			title: "WebP to JPG converter",
			intro: "Convert WebP images to JPG in your browser for apps and services that only accept JPG.",
			detail: "Some upload forms, editors and older applications still reject WebP. Converting to JPG produces a universally readable file; because JPG is lossy, choose a quality level appropriate to the image's next use.",
			tip: "Transparency is lost: WebP alpha channels flatten onto white. For images that must stay transparent or pixel-exact, convert to PNG instead. The workspace shows each result's size change.",
			faqs: [
				{
					q: "Why do some services still reject WebP?",
					a: "WebP is decades newer than JPG, and older content management systems, editors and form validators were never updated to accept it. Converting to JPG is the practical workaround.",
				},
				{
					q: "Is this conversion lossy?",
					a: "Yes. JPG re-encodes the image, and any artifacts from the original WebP encoding remain. Higher quality settings reduce the additional loss at the cost of larger files.",
				},
				{
					q: "Which format should I keep as my master copy?",
					a: "Keep the WebP when storage allows: it is smaller and preserves transparency. Make JPG copies for services that demand them.",
				},
			],
		},
		"heic-to-png": {
			title: "HEIC to PNG converter",
			intro: "Convert HEIC and HEIF photos to PNG in your browser, one at a time or in batches. No uploads.",
			detail: "PNG suits photos destined for editing, overlays or upload forms that reject HEIC: pixel-exact, lossless and widely accepted, at larger sizes than JPG. The iPhone original stays untouched on your device and each result reports its size change.",
			tip: "PNG photos are much larger than HEIC originals; choose JPG when size matters more than lossless storage. A few HEIC variants may not decode — re-export from the source device if that happens.",
			faqs: [
				{
					q: "Should I convert HEIC to PNG or to JPG?",
					a: "PNG when you will edit the photo or need lossless storage; JPG when you need a smaller file for sharing and forms. This site offers both: see the HEIC to JPG page for the smaller option.",
				},
				{
					q: "Do Live Photos convert?",
					a: "The still image converts normally. The short video clip attached to a Live Photo is a separate file and is not included in the PNG result.",
				},
				{
					q: "Why is my PNG much bigger than the HEIC?",
					a: "HEIC is one of the most efficient photo formats available, while PNG stores pixels losslessly. A larger file is the expected cost of lossless output.",
				},
			],
		},
		"svg-to-png": {
			title: "SVG to PNG converter",
			intro: "Rasterize SVG graphics to PNG locally. Produce fixed-size bitmap exports for places that require them.",
			detail: "SVG scales to any size, but app stores, marketplaces and form fields usually demand PNG at specific pixel dimensions. This conversion renders your vector file to PNG in the browser; the SVG original is not modified.",
			tip: "Complex SVG features — web fonts, filters, external references — may render differently or not at all when rasterized. Check the result at its target size, and re-export from your design tool if anything looks off.",
			faqs: [
				{
					q: "What size will the PNG be?",
					a: "Plain-number width and height attributes in the SVG become the PNG size. When they are missing or use units and percentages, the viewBox proportions are used instead; if neither is usable, the output is a 512×512 canvas. For exact dimensions, set plain width and height in the SVG or export from your design tool.",
				},
				{
					q: "Why do fonts in my SVG look wrong?",
					a: "SVG text relies on fonts available on the viewing device. Text converted to paths or outlines renders reliably; references to specific fonts may substitute. Outlining text in your editor avoids the issue.",
				},
				{
					q: "Is the result still scalable?",
					a: "No. PNG is a fixed-resolution bitmap. Keep the SVG as your master file and rasterize again whenever you need a different size.",
				},
			],
		},
		"wav-to-mp3": {
			title: "WAV to MP3 converter",
			intro: "Convert WAV audio to MP3 in your browser. Batch-process recordings and music without uploading them.",
			detail: "WAV stores uncompressed PCM audio, so files are large; MP3 compresses them to a fraction of the size with playback that works practically everywhere. Choose a lower bitrate for voice recordings and a higher one for music, then compare the results in the workspace.",
			tip: "MP3 is lossy, so the conversion cannot be undone; keep the original WAV as an archive copy. Unusual WAV layouts beyond standard PCM may fail to decode.",
			faqs: [
				{
					q: "Which bitrate should I choose for the MP3?",
					a: "192 kbps suits most music and 128 kbps is fine for speech. Higher bitrates preserve more detail at the cost of larger files; the workspace reports each result's size so you can compare.",
				},
				{
					q: "Will the MP3 sound identical to the WAV?",
					a: "MP3 discards some audio data by design. Most listeners cannot tell the difference at higher bitrates on ordinary equipment, but archival and production work should stay in a lossless format.",
				},
				{
					q: "Why is my WAV file so large?",
					a: "WAV stores every sample uncompressed — roughly 10 MB per minute for CD-quality stereo. That makes it ideal for recording and editing, and impractical for sharing, which is what MP3 is for.",
				},
			],
		},
		"mp3-to-wav": {
			title: "MP3 to WAV converter",
			intro: "Turn MP3 files into WAV audio locally. Useful for editors and devices that expect uncompressed input.",
			detail: "Converting to WAV does not restore the data MP3 compression removed; it repackages the decoded audio in an uncompressed container. WAV suits editing chains and hardware that rejects lossy formats — not saving space, since files grow substantially.",
			tip: "WAV output runs around 10 MB per minute of stereo audio. Converting a lossy file to WAV again will not improve its quality; keep lossless sources if you need pristine audio.",
			faqs: [
				{
					q: "Does MP3 to WAV improve sound quality?",
					a: "No. The conversion decodes the existing MP3 data and stores it losslessly from there on, but quality already lost to MP3 encoding cannot be recovered.",
				},
				{
					q: "Why is the WAV file so much larger?",
					a: "WAV stores every sample uncompressed — about 10 MB per minute for CD-quality stereo — while MP3 compresses by discarding data considered less audible.",
				},
				{
					q: "Can I edit the WAV result in audio software?",
					a: "Yes. WAV is the standard interchange format for editors and DAWs, and each subsequent save stays lossless, so no further quality is lost while you work.",
				},
			],
		},
		"m4a-to-mp3": {
			title: "M4A to MP3 converter",
			intro: "Convert M4A audio to MP3 in your browser, in batches, without uploading files.",
			detail: "M4A files usually contain AAC audio; some contain Apple Lossless (ALAC). Both convert to MP3 here. MP3 remains the safest choice for car stereos, MP3 players and older software that does not recognise AAC.",
			tip: "DRM-protected purchases cannot be converted. Moving from AAC or ALAC to MP3 is lossy, so keep the original file for the best future quality.",
			faqs: [
				{
					q: "Can protected M4A files be converted?",
					a: "No. Files with DRM fail to convert. Music bought from the iTunes Store before 2009 and subscription downloads are often protected; ripped or DRM-free files convert normally.",
				},
				{
					q: "Will converting M4A to MP3 lose quality?",
					a: "Slightly, and irreversibly: MP3 re-encodes audio that AAC already compressed. At high bitrates the difference is rarely audible. ALAC sources keep full detail until the MP3 encoding step.",
				},
				{
					q: "Which is more widely supported, M4A or MP3?",
					a: "MP3. Modern phones and computers all play AAC/M4A, but car head units, older players and some apps still expect MP3 first.",
				},
			],
		},
		"mp3-to-m4a": {
			title: "MP3 to M4A converter",
			intro: "Repackage MP3 audio as M4A in your browser. Useful for Apple ecosystems and apps that prefer AAC.",
			detail: "This conversion decodes MP3 and re-encodes it as M4A. The result does not regain quality lost to MP3 encoding, but AAC often reaches similar audibility at smaller sizes, which helps when a library must stay compact.",
			tip: "If your source exists as a CD rip or lossless file, converting that source directly to M4A avoids a second lossy step. Keep originals when storage allows.",
			faqs: [
				{
					q: "Is M4A better than MP3?",
					a: "At equal bitrates AAC usually sounds slightly better and it is the default on Apple platforms. MP3 remains more universal on old hardware, so the best choice depends on where you play your files.",
				},
				{
					q: "Why doesn't conversion improve the sound?",
					a: "Decoding MP3 yields exactly the audio it stored — no more. Re-encoding cannot add back detail the MP3 encoder discarded.",
				},
				{
					q: "Do artist and artwork tags survive?",
					a: "Some metadata may not carry over between containers. Convert one file and check its tags in your player before batch-converting a whole library.",
				},
			],
		},
		"flac-to-mp3": {
			title: "FLAC to MP3 converter",
			intro: "Convert lossless FLAC music to MP3 locally. Keep the archive, make the portable copy.",
			detail: "FLAC preserves every sample of the original recording; MP3 makes music portable at a fraction of the size. A common pattern: keep FLAC as the permanent library and create MP3 copies for phones, car stereos and players with limited storage.",
			tip: "Converting FLAC to MP3 discards audio data permanently. Keep the FLAC original — converting an MP3 back to FLAC later will not restore the lost detail.",
			faqs: [
				{
					q: "What bitrate suits music converted from FLAC?",
					a: "256–320 kbps is the usual range for music. Differences from lossless are subtle on typical listening equipment; lower bitrates are fine for background listening.",
				},
				{
					q: "Why keep the FLAC files at all?",
					a: "Libraries outlive devices. Lossless masters let you re-encode for any future format or fix tags without quality loss, while each lossy-to-lossy conversion compounds damage.",
				},
				{
					q: "Do album tags and artwork survive?",
					a: "Some metadata may not carry over on re-encoding. Test one album, check its tags in your player, then batch the rest of the library.",
				},
			],
		},
		"opus-to-mp3": {
			title: "Opus to MP3 converter",
			intro: "Convert Opus audio to MP3 in your browser for players and apps that do not support Opus.",
			detail: "Opus is efficient for streaming, calls and voice, but hardware and app support still lags MP3. This conversion decodes Opus and re-encodes MP3; results are often larger, because MP3 needs more bits for the same audibility.",
			tip: "Opus is lossy, so converting to MP3 stacks one lossy encoding on another. When a recording also exists as a lossless original, convert from that instead.",
			faqs: [
				{
					q: "Why is my MP3 larger than the Opus source?",
					a: "Opus compresses more efficiently than MP3, especially at low bitrates. Matching the same audibility in MP3 takes more bits, so the file grows even though quality does not improve.",
				},
				{
					q: "Do voice recordings convert well?",
					a: "Yes. Speech tolerates compression far better than music, so voice memos and call recordings survive Opus-to-MP3 conversion with no audible trouble at moderate bitrates.",
				},
				{
					q: "Which apps still need MP3 instead of Opus?",
					a: "Car head units, older MP3 players, some podcast apps and various web upload forms still reject Opus. MP3 remains the compatibility fallback.",
				},
			],
		},
		"aiff-to-mp3": {
			title: "AIFF to MP3 converter",
			intro: "Convert AIFF recordings to MP3 in your browser. Common for audio exported from macOS and studio tools.",
			detail: "AIFF is Apple's uncompressed audio container, equivalent in size to WAV. MP3 output makes those recordings practical to share and store, with a bitrate you can tune per batch — speech and music have different needs.",
			tip: "AIFF, AIFC and .aif files are all accepted. MP3 is lossy; archive the original AIFF whenever the recording matters.",
			faqs: [
				{
					q: "Is AIFF the same as WAV?",
					a: "Functionally close: both store uncompressed PCM audio at the same sizes. AIFF is the traditional choice on macOS, WAV elsewhere. For MP3 conversion they behave identically.",
				},
				{
					q: "Can I convert several AIFF files at once?",
					a: "Yes. Add the whole batch and each file converts with the settings shown, individually or as a group download. Nothing leaves your device.",
				},
				{
					q: "What bitrate for voice memos and interviews?",
					a: "96–128 kbps is plenty for speech. Music needs more; 192 kbps and above is a safer range for mixed content.",
				},
			],
		},
		"wma-to-mp3": {
			title: "WMA to MP3 converter",
			intro: "Convert Windows Media Audio files to MP3 locally, without installing media software.",
			detail: "WMA files often come from older Windows tools, voice recorders and download stores. MP3 plays practically everywhere, so converting an old WMA library makes it portable again — processed entirely on your device.",
			tip: "Some WMA files are DRM-protected and cannot be converted. WMA is lossy, so the MP3 result inherits its quality ceiling; keep originals where you still have them.",
			faqs: [
				{
					q: "Why won't my WMA file convert?",
					a: "The most common cause is DRM protection on files from old download stores. A few rare WMA codec variants may also fail to decode; those files need the original Windows software.",
				},
				{
					q: "Is WMA worse quality than MP3?",
					a: "At low bitrates WMA was competitive with MP3. Either way, re-encoding cannot improve quality — it only changes which devices can play the file.",
				},
				{
					q: "Can I batch-convert a whole WMA library?",
					a: "Yes. Add the folder's files to the queue and convert them in one run, downloading individually or as a ZIP. Protected files are reported as failures rather than silently skipped.",
				},
			],
		},
		"mp4-to-mp3": {
			title: "MP4 to MP3 converter",
			intro: "Extract the audio track from MP4 video as MP3, entirely in your browser. The video never leaves your device.",
			detail: "This conversion keeps the sound and drops the pictures: the audio stream is decoded and encoded as MP3. Useful for lectures, interviews, podcasts and music videos where only listening matters.",
			tip: "Large videos are limited by browser memory rather than a fixed quota — very long files may fail on devices with little RAM. The original video is not modified and no upload happens.",
			faqs: [
				{
					q: "Does converting remove the video from my file?",
					a: "No. Your original MP4 stays exactly as it is; you get a new, separate MP3 file alongside it.",
				},
				{
					q: "How large a video can I convert?",
					a: "Browser memory sets the ceiling — the file buffer tops out just under 2 GiB. Typical videos work fine; multi-hour recordings on low-RAM devices may not.",
				},
				{
					q: "Which bitrate should I choose?",
					a: "128 kbps suits speech content; 192–320 kbps suits music videos. Higher bitrates sound better but produce proportionally larger files.",
				},
			],
		},
		"webm-to-mp3": {
			title: "WebM to MP3 converter",
			intro: "Pull the audio out of WebM video files as MP3, locally in your browser.",
			detail: "WebM files usually carry Opus or Vorbis audio. Both decode here and re-encode to MP3, which remains the most widely accepted audio format for editors, players and upload forms.",
			tip: "Screen recordings and downloaded clips sometimes contain silent or multichannel audio tracks — check one result before batch converting. Files are processed on your device only.",
			faqs: [
				{
					q: "Why is the MP3 bigger than the WebM?",
					a: "WebM's audio codecs (Opus, Vorbis) are more efficient than MP3. Re-encoding to MP3 trades compatibility for size, so the audio track grows.",
				},
				{
					q: "Can I convert a WebM with no audio track?",
					a: "No. Files without an audio stream fail with a clear error — a silent screen recording has nothing to extract.",
				},
				{
					q: "Does the video resolution matter?",
					a: "No. Only the audio stream is decoded; a 4K and a 240p WebM with identical sound produce identical results.",
				},
			],
		},
		"mov-to-mp3": {
			title: "MOV to MP3 converter",
			intro: "Convert iPhone and camera MOV videos to MP3 audio without uploading the footage.",
			detail: "MOV is the container used by iPhones, many cameras and screen recorders, typically carrying AAC audio. This page decodes that track and encodes MP3 — handy for voice memos, lectures and clips you want to listen to rather than watch.",
			tip: "HEVC-encoded videos, common on newer iPhones, work fine: only the audio track is read. Very large recordings depend on available browser memory. The original video is never modified.",
			faqs: [
				{
					q: "Do iPhone videos work?",
					a: "Yes. MOV recordings from iOS and macOS, including HEVC variants, are supported for audio extraction. The video stays on your device throughout.",
				},
				{
					q: "Can I extract audio from several videos at once?",
					a: "Yes. Add all the files to the queue; they convert with the same settings and can be downloaded individually or together.",
				},
				{
					q: "Will the original MOV change?",
					a: "Never. The result is a new MP3 file; the original video remains untouched in place.",
				},
			],
		},
		"docx-to-md": {
			title: "DOCX to Markdown converter",
			intro: "Convert Word documents to Markdown locally. Get clean text for docs sites, READMEs and Git repositories.",
			detail: "The conversion runs a document engine in your browser: headings, lists, tables and links map to Markdown syntax. Best results come from simply structured documents; heavy layout, text boxes and tracked changes do not translate.",
			tip: "Review the Markdown after converting — complex Word features may be dropped or flattened rather than silently corrupted. The original DOCX never leaves your device.",
			faqs: [
				{
					q: "What happens to images in the document?",
					a: "Text structure is the focus: image references may appear in the Markdown, but the image files themselves are not exported. Re-add images from the original document as needed.",
				},
				{
					q: "Which formatting survives?",
					a: "Headings, bold and italic, lists, tables, links and quotes convert reliably. Columns, text boxes, headers/footers and tracked changes do not — they are omitted rather than garbled.",
				},
				{
					q: "Is my document uploaded anywhere?",
					a: "No. The conversion engine runs in your browser via WebAssembly. The document is read from disk and processed in memory on your machine.",
				},
			],
		},
		"md-to-docx": {
			title: "Markdown to DOCX converter",
			intro: "Turn Markdown files into Word documents locally. Ship docs to people who live in Word.",
			detail: "Headings, emphasis, lists, code blocks and links become proper Word structure. The result opens in Word, LibreOffice and Google Docs. Processing happens entirely in your browser; the Markdown is never uploaded.",
			tip: "Markdown has no page-layout concept — margins, fonts and page breaks use Word defaults and can be adjusted after opening. Very long documents may take a moment on low-memory devices.",
			faqs: [
				{
					q: "Which Markdown features are supported?",
					a: "The standard set: ATX headings, ordered and unordered lists, pipe tables, fenced code blocks, links, emphasis and blockquotes. Raw HTML embedded in Markdown is generally dropped.",
				},
				{
					q: "Can I control the Word styling?",
					a: "The converter applies its own default styling. Open the DOCX in Word and apply your template or theme afterwards for house styles.",
				},
				{
					q: "Will tables and code blocks look right?",
					a: "Pipe tables become Word tables and fenced code becomes monospaced blocks. Complex nested content may need a touch-up after conversion.",
				},
			],
		},
		"epub-to-docx": {
			title: "EPUB to DOCX converter",
			intro: "Convert EPUB e-books to Word documents in your browser, without uploading the book.",
			detail: "Useful when you need to annotate an e-book in Word, extract chapters for editing, or hand a manuscript to someone working in office software. Chapter structure and basic formatting carry over; DRM-protected store purchases do not convert.",
			tip: "E-book typography — fonts, drop caps, fixed layouts — will not match the original; the goal is editable text, not a visual copy. Check chapter breaks and image placement after converting.",
			faqs: [
				{
					q: "Can I convert purchased e-books?",
					a: "Only DRM-free EPUB files. Store purchases protected with DRM fail to convert, by design — this tool processes files you legitimately own without restrictions.",
				},
				{
					q: "Do images survive the conversion?",
					a: "Some images carry over, though placement may shift in Word. Check the output against the original for figures and cover art you need.",
				},
				{
					q: "Is my book uploaded?",
					a: "No. The document engine runs in your browser; the EPUB is read and converted entirely on your device.",
				},
			],
		},
		"png-converter": {
			title: "PNG converter",
			intro: "Convert PNG images to and from other formats in your browser. Every tool on this page processes files locally.",
			detail: "PNG is the safe, lossless choice for screenshots, line art and images needing transparency. Pick a conversion below to preselect its formats: to WebP or AVIF when web performance matters, to JPG when a form only accepts photos, or into PNG from WebP, JPG, HEIC, SVG or PDF pages.",
			tip: "Lossless PNG files are usually larger than lossy outputs. If a converted PNG must stay small, run it through the image compressor or choose JPG/WebP instead.",
			faqs: [
				{
					q: "Is PNG lossless?",
					a: "Yes. PNG stores every pixel exactly, which is why it is preferred for screenshots, diagrams and any image that must not degrade — and why files are larger than lossy formats.",
				},
				{
					q: "When should I not use PNG?",
					a: "For photographs destined for sharing or the web, JPG or WebP give far smaller files with no visible difference. PNG shines on sharp edges, text and transparency.",
				},
				{
					q: "Are these conversions really free?",
					a: "Yes. Every tool linked here is free, requires no account, and processes files in your browser rather than on a server.",
				},
			],
		},
		"jpg-converter": {
			title: "JPG converter",
			intro: "Convert images to and from JPG in your browser. Batch-friendly, no uploads, no accounts.",
			detail: "JPG is the world's default photo format, accepted by virtually every form, editor and device. Convert into JPG from HEIC, PNG or WebP for compatibility — or out of JPG to PNG for lossless editing, keeping in mind that PNG cannot restore transparency the JPG never stored.",
			tip: "JPG discards some image data each time it is encoded; repeatedly re-saving a JPG degrades it. Work from originals whenever quality matters.",
			faqs: [
				{
					q: "JPG or JPEG — what is the difference?",
					a: "None. They are the same format; JPEG is the original name and JPG the three-letter shorthand kept for older Windows systems. Both files convert identically here.",
				},
				{
					q: "Does converting to JPG lose quality?",
					a: "Yes, somewhat — JPG is lossy. The quality setting controls the trade-off; at balanced settings the difference is rarely visible, and the workspace reports each file's size change.",
				},
				{
					q: "Can JPG store transparency?",
					a: "No. Transparent areas flatten onto white when converting to JPG. Use PNG or WebP for images that need transparent backgrounds.",
				},
			],
		},
		"webp-converter": {
			title: "WebP converter",
			intro: "Convert PNG or JPG images to WebP — and WebP back to PNG or JPG — locally in your browser.",
			detail: "WebP is a modern image format: smaller than JPG and PNG at similar quality, with transparency support. Convert to WebP to slim websites and storage; convert from WebP for editors and forms that still reject it.",
			tip: "Converting WebP to PNG or JPG cannot recover quality the WebP encoding already discarded, and JPG output loses transparency. Keep WebP masters when storage allows.",
			faqs: [
				{
					q: "Is WebP really smaller than JPG?",
					a: "Usually, yes — typically 25–35% smaller at comparable quality. Very small or already-optimized images can defy that, so compare the reported sizes rather than assuming.",
				},
				{
					q: "Do all browsers support WebP?",
					a: "All current major browsers do. Some older desktop applications, CMS platforms and upload forms do not — which is when converting WebP to PNG or JPG helps.",
				},
				{
					q: "Can WebP be lossless?",
					a: "Yes. WebP has a lossless mode; choose the lossless quality setting in the workspace when exact pixels matter, at the cost of larger files.",
				},
			],
		},
		"mp3-converter": {
			title: "MP3 converter",
			intro: "Free MP3 converter: turn audio and video into MP3 — or MP3 into other formats — right in your browser, with no uploads.",
			detail: "MP3 remains the compatibility champion: car stereos, players, editors and upload forms all accept it. Convert WAV, FLAC, M4A, Opus, AIFF or WMA audio into MP3, extract MP3 audio from MP4, WebM or MOV video, or turn MP3 into WAV for editing.",
			tip: "MP3 is lossy: converting other lossy formats to MP3 stacks compressions. Use the highest reasonable bitrate, and keep lossless originals for future conversions.",
			faqs: [
				{
					q: "Is MP3 still worth using?",
					a: "For compatibility, yes — nothing else plays everywhere. AAC and Opus are more efficient at the same quality, so use them when you control the playback environment.",
				},
				{
					q: "What bitrate should I pick?",
					a: "128 kbps works for speech, 192 kbps and above for music, and 320 kbps for archival-minded portable copies. The workspace reports sizes so you can weigh quality against space.",
				},
				{
					q: "Can I extract MP3 audio from video?",
					a: "Yes. Dedicated pages cover MP4, WebM and MOV to MP3 extraction; only the audio stream is decoded and the video file is never modified.",
				},
			],
		},
		"docx-converter": {
			title: "DOCX converter",
			intro: "Convert Word documents to and from other formats locally. Your files stay in the browser.",
			detail: "DOCX is the office standard but a poor fit for plain-text workflows. Convert DOCX into Markdown for documentation and Git, or build DOCX from Markdown and EPUB when Word format is required. Simply structured documents map best.",
			tip: "Word features such as tracked changes, text boxes and columns do not survive conversion in either direction. Convert a sample first when formatting matters.",
			faqs: [
				{
					q: "Can I convert DOCX to PDF here?",
					a: "Not currently — in-browser PDF generation is not part of this site's converters yet. The tools linked here focus on Markdown, EPUB and editable text workflows.",
				},
				{
					q: "Do comments and tracked changes carry over?",
					a: "No. Conversions read the document's content; review markup is omitted. Accept or reject changes in Word before converting if they affect the text.",
				},
				{
					q: "Are document conversions private?",
					a: "Yes. The conversion engine runs in your browser via WebAssembly; documents are processed in memory on your device and never uploaded.",
				},
			],
		},
		"m4a-to-wav": {
			title: "M4A to WAV converter",
			intro: "Convert M4A audio to WAV locally, for editors and workflows that need uncompressed input.",
			detail: "The AAC audio inside the M4A is decoded and stored as uncompressed WAV. Useful before audio editing or workflows that reject lossy files — with the caveat that decoding cannot restore detail the AAC encoding already removed.",
			tip: "WAV files run about 10 MB per minute of stereo audio. For listening and sharing, keeping the M4A or converting to MP3 is usually the better trade.",
			faqs: [
				{
					q: "Why convert M4A to WAV at all?",
					a: "Editing chains and some hardware want uncompressed files. WAV keeps every decoded sample losslessly from the conversion onwards, so nothing further is lost while you work.",
				},
				{
					q: "Will the WAV sound better than the M4A?",
					a: "No. It is the same decoded audio in a bigger container. WAV prevents further loss in later editing; it does not improve anything.",
				},
				{
					q: "Does ALAC change anything?",
					a: "Yes, favourably. ALAC-based M4A files are lossless, so their WAV output preserves the full source quality rather than an AAC-compressed version of it.",
				},
			],
		},
		"wav-to-flac": {
			title: "WAV to FLAC converter",
			intro: "Compress WAV audio to FLAC locally — a lossless halving of size with zero quality loss.",
			detail: "FLAC compresses WAV exactly: every sample survives decoding, typically at around half the size. The natural move for archived recordings that currently sit as heavy WAV files.",
			tip: "FLAC plays on computers, phones and modern players; a few exotic hardware players still want WAV. Keep a WAV copy only for those specific targets.",
			faqs: [
				{
					q: "Is FLAC really lossless?",
					a: "Yes. A decoded FLAC is bit-identical to the source WAV — checksums match — which is why it is the standard archive format for audio.",
				},
				{
					q: "How much smaller will my files get?",
					a: "Typically 40–60% of the WAV size depending on content complexity. The workspace reports each result's actual size.",
				},
				{
					q: "Can I convert back to WAV later?",
					a: "Yes, exactly. FLAC to WAV restores the identical samples, so converting to FLAC is reversible in a way lossy formats are not.",
				},
			],
		},
		"mp3-to-flac": {
			title: "MP3 to FLAC converter",
			intro: "Wrap MP3 audio in a lossless FLAC container locally — and understand what that does and does not do.",
			detail: "Converting MP3 to FLAC produces a larger file that preserves the decoded MP3 exactly, but it cannot restore the quality the MP3 encoding discarded. FLAC makes sense here for software and pipelines that insist on lossless files, not for quality.",
			tip: "If a lossless original exists, convert from that source instead — an MP3-derived FLAC can never exceed its MP3. Expect the file to grow to roughly WAV scale.",
			faqs: [
				{
					q: "Does MP3 to FLAC improve quality?",
					a: "No. The audio is identical to what the MP3 contains. FLAC's losslessness applies from conversion onwards; it cannot reverse the earlier lossy encoding.",
				},
				{
					q: "Why would I convert MP3 to FLAC then?",
					a: "Some editors, archiving rules and upload pipelines accept only lossless files. FLAC satisfies them while keeping the audio bit-exact from this point on.",
				},
				{
					q: "Why is the FLAC so much bigger?",
					a: "FLAC stores the full decoded samples — MP3-sized compression only works by discarding audio, which FLAC refuses to do.",
				},
			],
		},
		"aac-to-mp3": {
			title: "AAC to MP3 converter",
			intro: "Convert AAC audio to MP3 in your browser, for players and car stereos that only speak MP3.",
			detail: "AAC is the newer codec inside M4A files and many streaming formats; MP3 remains the compatibility floor. This conversion decodes AAC and re-encodes MP3 — two lossy formats, so keep the source when you can.",
			tip: "Bare .aac tracks convert here; M4A files (AAC in an MP4 container) have their own page. At similar quality the MP3 is usually slightly larger than the AAC source.",
			faqs: [
				{
					q: "AAC or MP3 — which is better?",
					a: "AAC sounds slightly better at the same bitrate and is standard on modern platforms; MP3 plays on more older devices. Convert when compatibility with older players matters.",
				},
				{
					q: "Will I lose quality converting AAC to MP3?",
					a: "Some, irreversibly: MP3 re-encodes audio that AAC already compressed. Higher bitrate settings keep the difference mostly inaudible.",
				},
				{
					q: "Does this work for M4A files?",
					a: "This page targets bare .aac audio tracks. For .m4a files, use the dedicated M4A to MP3 page — same conversion, tuned guidance.",
				},
			],
		},
		"mp3-to-aac": {
			title: "MP3 to AAC converter",
			intro: "Re-encode MP3 audio as AAC locally. A modern codec, smaller files, Apple-friendly output.",
			detail: "AAC usually reaches the same audibility as MP3 at lower bitrates and is the default audio codec on Apple platforms and in many cameras. Converting cannot restore MP3 losses, but it can stop the size penalty from compounding.",
			tip: "If your sources still exist as lossless files, encode AAC from those directly. Bare .aac output plays in most current software; a few old devices want MP3.",
			faqs: [
				{
					q: "Is AAC better than MP3?",
					a: "In efficiency, yes — comparable quality at lower bitrates. Compatibility is slightly narrower on very old hardware. Choose based on where you play your files.",
				},
				{
					q: "Why convert at all if MP3 works?",
					a: "Ecosystems that prefer AAC — iPhones, modern cameras, some streaming workflows — handle it natively, and smaller files add up across a library.",
				},
				{
					q: "Do tags and artwork survive?",
					a: "Some metadata may not carry between formats. Convert one file and check its tags in your player before batch processing a library.",
				},
			],
		},
		"ogg-to-mp3": {
			title: "OGG to MP3 converter",
			intro: "Convert OGG (Vorbis) audio to MP3 locally, in batches, without uploading.",
			detail: "OGG Vorbis shows up in game assets, older downloads and Linux tools. MP3 output makes those files playable on car stereos, players and apps that never learned Vorbis.",
			tip: "Both formats are lossy, so re-encoding trades a little quality for compatibility. Files that fail may contain Theora video or unusual Vorbis setups.",
			faqs: [
				{
					q: "Is OGG the same as Vorbis?",
					a: "OGG is the container; the audio inside is usually Vorbis. This page handles OGG files carrying Vorbis audio — the common case.",
				},
				{
					q: "Why convert OGG to MP3?",
					a: "Compatibility. Vorbis never got hardware support, so MP3 remains the format every player, editor and upload form accepts.",
				},
				{
					q: "How much quality do I lose?",
					a: "A little, from stacking two lossy encodings. At moderate bitrates the difference is minor for most listeners; keep the OGG if you can.",
				},
			],
		},
		"m4b-to-mp3": {
			title: "M4B to MP3 converter",
			intro: "Convert M4B audiobooks to MP3 in your browser. Listen on any player, without uploads.",
			detail: "M4B is the audiobook flavour of M4A — the same AAC audio plus chapter markers and bookmark support. MP3 output plays everywhere but drops chapters: each file becomes one continuous track.",
			tip: "DRM-protected store audiobooks will not convert. Long books produce large files; 64–128 kbps is plenty for narration.",
			faqs: [
				{
					q: "Do chapters survive the conversion?",
					a: "No. MP3 carries no chapter markers here, so the result is a single linear track. Note the chapter timestamps before converting if you rely on them.",
				},
				{
					q: "Which bitrate suits audiobooks?",
					a: "64–128 kbps is plenty for narration — voice needs far less than music. Lower settings keep long books at a manageable size.",
				},
				{
					q: "Can I convert store-purchased audiobooks?",
					a: "Only DRM-free files. Protected purchases fail by design; this tool processes books you own without usage restrictions.",
				},
			],
		},
		"amr-to-mp3": {
			title: "AMR to MP3 converter",
			intro: "Convert AMR voice recordings to MP3 locally. Common output from old phones and dictaphones.",
			detail: "AMR is a narrowband voice codec from early mobile phones — tiny files with telephone-grade sound. MP3 output plays everywhere without the original recorder software.",
			tip: "AMR cannot exceed its telephone-grade source; conversion is about compatibility, not fidelity. Both AMR-NB and the wider AMR-WB variants decode here.",
			faqs: [
				{
					q: "Why does my recording sound so dated?",
					a: "AMR narrowband keeps very little audio bandwidth — it was designed to squeeze voice over 2G calls. The conversion preserves it faithfully; it cannot widen what was never captured.",
				},
				{
					q: "What is AMR-WB?",
					a: "Wideband AMR, used by newer phones for higher voice quality. Both variants convert; wideband sources sound noticeably clearer in the MP3 result.",
				},
				{
					q: "Can I convert a whole folder of recordings?",
					a: "Yes. Add them all to the queue and convert in one run, downloading individually or as a ZIP.",
				},
			],
		},
		"ac3-to-mp3": {
			title: "AC3 to MP3 converter",
			intro: "Convert AC3 (Dolby Digital) audio to MP3 in your browser, from DVD rips and recordings.",
			detail: "AC3 carries 5.1 surround sound from DVDs and some cameras; MP3 is stereo. Conversion downmixes the channels to stereo — right for listening, not for home-theatre passthrough.",
			tip: "The surround downmix changes channel balance by design. Keep the AC3 when a receiver can decode it, and convert a sample first to check you like the stereo mix.",
			faqs: [
				{
					q: "What happens to the 5.1 channels?",
					a: "They are downmixed to stereo. Dialogue, music and effects survive; the surround placement obviously does not.",
				},
				{
					q: "Why convert AC3 at all?",
					a: "Portable players, some TVs and editors have no AC3 decoder. MP3 plays everywhere and is far simpler to work with.",
				},
				{
					q: "Does converting lose quality?",
					a: "AC3 is itself lossy, and MP3 adds its own encoding. At a reasonable bitrate the stereo result keeps the source's audible quality.",
				},
			],
		},
		"opus-to-wav": {
			title: "Opus to WAV converter",
			intro: "Decode Opus audio to uncompressed WAV locally, ready for editors that lack Opus support.",
			detail: "Some DAWs and tools still refuse Opus input. WAV output loads anywhere and carries exactly the audio Opus stored — after decoding there is no further loss.",
			tip: "Expect large files, around 10 MB per minute of stereo. For listening or sharing rather than editing, Opus to MP3 is usually the better trade.",
			faqs: [
				{
					q: "Why WAV instead of FLAC?",
					a: "WAV is the safest import format for editors and hardware. FLAC is the smaller lossless alternative once the file leaves the editing workflow.",
				},
				{
					q: "Does the conversion add quality?",
					a: "No, and none is lost either: decoding Opus is lossless. The WAV holds exactly what the Opus held, at full sample fidelity.",
				},
				{
					q: "Can I batch-convert recordings?",
					a: "Yes. Add the whole set; each file converts with the same settings and can be downloaded individually or together.",
				},
			],
		},
		"mkv-to-mp3": {
			title: "MKV to MP3 converter",
			intro: "Extract audio from MKV video as MP3, locally in your browser.",
			detail: "MKV containers hold all sorts of audio — commonly AAC, AC3, FLAC or DTS. This page decodes the audio track and encodes MP3; the video is not processed and the file never leaves your device.",
			tip: "Files with several audio tracks convert their first track. Spot-check one result before batch converting an archive, especially with commentary tracks present.",
			faqs: [
				{
					q: "Which audio track gets converted?",
					a: "The first audio track in the container. If your file has commentary or alternate tracks, verify the result before processing more files.",
				},
				{
					q: "Is the MKV file modified?",
					a: "Never. You get a new, separate MP3; the original video stays exactly as it is on your device.",
				},
				{
					q: "How large a file can I convert?",
					a: "Browser memory sets the ceiling — the file buffer tops out just under 2 GiB. Long, high-bitrate rips on low-RAM devices may fail.",
				},
			],
		},
		"avi-to-mp3": {
			title: "AVI to MP3 converter",
			intro: "Pull the audio out of legacy AVI videos as MP3, without uploading the footage.",
			detail: "AVI is the 1990s container still sitting in camera archives and old downloads. Its audio is often MP3 or PCM already; this page decodes it and produces a clean, universally playable MP3.",
			tip: "Old AVI files sometimes have broken indexes, and files that cannot seek may not decode. Test one file before batch converting an archive.",
			faqs: [
				{
					q: "The AVI already contains MP3 audio — why convert?",
					a: "The result is a standalone, consistent file without the video stream or container quirks, ready for players and editors that want plain audio.",
				},
				{
					q: "My AVI will not convert — is it broken?",
					a: "Possibly, or its index is. Files from interrupted downloads and failing drives often decode partially or not at all. Try a different file to isolate the issue.",
				},
				{
					q: "Does the video quality matter?",
					a: "Not at all — only the audio stream is decoded. The video track is ignored completely.",
				},
			],
		},
		"wmv-to-mp3": {
			title: "WMV to MP3 converter",
			intro: "Convert Windows Media videos to MP3 audio locally, no Silverlight-era software required.",
			detail: "WMV files come from old Windows tools, email attachments and download portals. Only the audio stream is decoded — usually WMA — and re-encoded as MP3 that plays anywhere.",
			tip: "DRM-protected WMV files fail to convert, and a few very old WMV variants may not decode in the browser; those need the original Windows software.",
			faqs: [
				{
					q: "Can protected WMV files be converted?",
					a: "No. DRM-protected files fail, by design. Files you recorded or downloaded without restrictions convert normally.",
				},
				{
					q: "Is the video processed at all?",
					a: "No. Only the audio stream is decoded; the WMV stays untouched on your device and no upload happens.",
				},
				{
					q: "Can I batch-convert old downloads?",
					a: "Yes. Add the folder's files and convert them in one run. Protected or undecodable files are reported as failures rather than skipped silently.",
				},
			],
		},
		"flv-to-mp3": {
			title: "FLV to MP3 converter",
			intro: "Extract MP3 audio from Flash-era FLV videos, locally in your browser.",
			detail: "FLV is the Flash video container from the 2000s web, still sitting in old download folders. Its audio is typically MP3 or AAC; conversion produces a clean standalone MP3.",
			tip: "FLV files without an audio track — silent screen recordings — have nothing to extract and fail clearly. Corrupt downloads from long-dead servers may not decode.",
			faqs: [
				{
					q: "Why do I still have FLV files?",
					a: "The 2000s web ran on Flash, and old download folders preserve it. Convert the audio you care about; the rest can finally go.",
				},
				{
					q: "What audio is inside an FLV?",
					a: "Usually MP3 or AAC. Either decodes here and re-encodes to a fresh MP3 at your chosen bitrate.",
				},
				{
					q: "Can I convert several FLV files at once?",
					a: "Yes. Queue the whole batch; results download individually or as a ZIP, all processed on your device.",
				},
			],
		},
		"mp4-to-wav": {
			title: "MP4 to WAV converter",
			intro: "Extract uncompressed WAV audio from MP4 video, entirely on your device.",
			detail: "Built for editing workflows: the video's audio track decodes to WAV that any editor accepts. The sibling MP4 to MP3 page covers listening and sharing; this one is for production.",
			tip: "WAV is large — roughly 10 MB per minute of stereo. Very long videos may hit browser memory limits on low-RAM devices.",
			faqs: [
				{
					q: "MP4 to MP3 or MP4 to WAV?",
					a: "MP3 for listening and sharing — smaller and universal. WAV for editing and processing, where lossless input avoids compounding compression.",
				},
				{
					q: "Is the original video modified?",
					a: "Never. The MP4 stays exactly as it is and you receive a separate WAV file.",
				},
				{
					q: "What are the size limits?",
					a: "Browser memory is the ceiling — the file buffer tops out just under 2 GiB. Ordinary videos convert fine; multi-hour recordings may not on small devices.",
				},
			],
		},
		"avif-to-png": {
			title: "AVIF to PNG converter",
			intro: "Convert AVIF images to PNG locally, for editors and forms that do not take AVIF yet.",
			detail: "AVIF decodes to exact pixels and PNG re-stores them losslessly, transparency included. Useful when a workflow — an older CMS, some editors — rejects AVIF uploads.",
			tip: "PNG is usually larger than AVIF, sometimes much larger for photographs. Artifacts baked in by the original AVIF encoding cannot be undone.",
			faqs: [
				{
					q: "Does AVIF to PNG lose quality?",
					a: "No further loss. The AVIF decodes to exact pixels and PNG stores them losslessly; what you see is what the AVIF contained.",
				},
				{
					q: "Why did the file get bigger?",
					a: "AVIF compresses far more efficiently than PNG, especially for photos. Growth is the normal cost of moving to a lossless, universally readable format.",
				},
				{
					q: "Is transparency preserved?",
					a: "Yes. AVIF alpha channels carry over to PNG exactly. Use the AVIF to JPG page only when transparency does not matter.",
				},
			],
		},
		"avif-to-jpg": {
			title: "AVIF to JPG converter",
			intro: "Convert AVIF images to JPG in your browser, for universal compatibility.",
			detail: "JPG opens literally everywhere; AVIF does not yet. Conversion decodes the AVIF and encodes JPG at a quality you choose. Transparent areas flatten onto white.",
			tip: "Prefer the AVIF to PNG page when transparency or further editing matters; JPG is for sharing and forms that demand it. The workspace reports each result's size change.",
			faqs: [
				{
					q: "What happens to transparent areas?",
					a: "JPG has no transparency support, so they flatten onto white. Convert to PNG instead when the transparency matters.",
				},
				{
					q: "Which quality should I pick?",
					a: "80–90 suits most images. Lower values shrink files further but soften detail; check a sample before batch converting.",
				},
				{
					q: "Why convert AVIF at all?",
					a: "For the places that still refuse it: older content management systems, some desktop apps and plenty of upload forms.",
				},
			],
		},
		"tiff-to-jpg": {
			title: "TIFF to JPG converter",
			intro: "Convert TIFF scans and photos to JPG locally. Shrink huge files for sharing and storage.",
			detail: "TIFF files from scanners and photo workflows are enormous because they store everything losslessly. JPG trades a controlled amount of quality for practical sizes — right for sharing, wrong for archival masters.",
			tip: "Multi-page TIFF files convert as their first page; handle additional pages individually. Keep the TIFF originals when the scans matter — JPG is a delivery copy.",
			faqs: [
				{
					q: "My TIFF has multiple pages — what converts?",
					a: "The first page. If you need every page, split the TIFF first or convert the pages as separate files.",
				},
				{
					q: "What about CMYK TIFFs from print workflows?",
					a: "Colour handling during conversion can shift exact tones. Convert one file and check the colours before processing a print archive.",
				},
				{
					q: "Which quality setting suits scans?",
					a: "80–90 works for most documents and photos. Text-heavy scans stay crisper with higher quality — or use the TIFF to PNG page for lossless output.",
				},
			],
		},
		"tiff-to-png": {
			title: "TIFF to PNG converter",
			intro: "Convert TIFF images to lossless PNG locally, transparency included.",
			detail: "PNG keeps every pixel the way TIFF does, at sizes friendlier to the web and in apps that do not read TIFF. The right choice for text scans, line art and images needing alpha.",
			tip: "PNG will not shrink photographic scans the way JPG does — that is the price of lossless. Multi-page TIFF files convert as their first page.",
			faqs: [
				{
					q: "TIFF or PNG — are they not both lossless?",
					a: "They are. PNG is lighter on features you rarely need and far more widely supported on the web and in everyday apps.",
				},
				{
					q: "Do multi-page TIFFs convert fully?",
					a: "Only the first page becomes a PNG. Split the file first when you need every page as its own image.",
				},
				{
					q: "Is transparency preserved?",
					a: "Yes. TIFF alpha channels carry over to PNG exactly.",
				},
			],
		},
		"psd-to-png": {
			title: "PSD to PNG converter",
			intro: "Export Photoshop PSD files as PNG images locally, without Photoshop or uploads.",
			detail: "The composite view of the PSD — the file as it looks flattened — becomes a pixel-exact PNG. Right for sharing designs and previews from Photoshop files without Adobe software.",
			tip: "Layers flatten into one image: individual layers are not exported and text becomes pixels. Complex blend modes may render slightly differently than in Photoshop.",
			faqs: [
				{
					q: "Do layers survive the conversion?",
					a: "No. The result is the flattened composite — what you see with all layers visible. Export layers separately from Photoshop if you need them individually.",
				},
				{
					q: "What happens to text layers?",
					a: "They render as pixels in the composite. Editable text requires the original PSD in an editor.",
				},
				{
					q: "Will it look exactly like in Photoshop?",
					a: "Very close. Most files match; exotic blend modes and adjustment layers can differ by a small amount. Check one file before batch exporting.",
				},
			],
		},
		"psd-to-jpg": {
			title: "PSD to JPG converter",
			intro: "Convert Photoshop PSD files to JPG locally for lightweight sharing.",
			detail: "The same flattened composite as the PNG export, encoded as JPG at a quality you choose — the practical pick for email previews and forms where PNG is too heavy.",
			tip: "Transparent areas flatten onto white. Keep the PSD as the working master; the JPG is a delivery copy you can regenerate any time.",
			faqs: [
				{
					q: "PSD to PNG or PSD to JPG?",
					a: "PNG for pixel-exact results and transparency; JPG for much smaller files. Both flatten the composite the same way.",
				},
				{
					q: "Why is my transparent background white?",
					a: "JPG cannot store transparency, so it flattens onto white. Use the PSD to PNG page when the background must stay transparent.",
				},
				{
					q: "Which quality should I choose?",
					a: "80–90 suits most previews. Since the PSD remains your master, you can always re-export at a different quality.",
				},
			],
		},
		"ico-to-png": {
			title: "ICO to PNG converter",
			intro: "Convert ICO icons to PNG locally — recover favicons and Windows icons as regular images.",
			detail: "ICO bundles one or more icon sizes into a single file. This conversion decodes the icon and saves a PNG that any editor, browser and document accepts.",
			tip: "An ICO may contain several resolutions; the decoder selects a frame and the workspace shows the resulting dimensions. Transparent backgrounds carry over.",
			faqs: [
				{
					q: "My ICO has multiple sizes — which do I get?",
					a: "The decoder picks one stored frame and the workspace shows the dimensions of the result. Convert again from a larger master when you need a different size.",
				},
				{
					q: "Is transparency preserved?",
					a: "Yes. Icon transparency converts cleanly to PNG — unlike JPG, which would flatten it.",
				},
				{
					q: "Why convert an ICO at all?",
					a: "PNG opens in editors, design tools and documents; ICO mostly exists for Windows executables and favicons. It is the way to actually view and reuse an icon.",
				},
			],
		},
		"bmp-to-jpg": {
			title: "BMP to JPG converter",
			intro: "Convert BMP images to JPG locally. Turn giant uncompressed bitmaps into shareable files.",
			detail: "BMP stores raw pixels with almost no compression — paint programs and old software screenshots. JPG cuts the size dramatically at a quality you control.",
			tip: "Line art and screenshots with small text can soften in JPG; the lossless alternative for those is PNG. The workspace shows the real size change per file.",
			faqs: [
				{
					q: "Why are BMP files so large?",
					a: "They store every pixel uncompressed, often plus padding. A JPG copy is typically a small fraction of the size at visually similar quality.",
				},
				{
					q: "Does BMP have transparency to worry about?",
					a: "Usually not — most BMP files are fully opaque. JPG has no transparency support regardless, so nothing is lost in practice.",
				},
				{
					q: "Should I use PNG instead of JPG?",
					a: "For screenshots, diagrams and anything with text, yes — PNG is lossless and those images compress well. JPG suits photographic content.",
				},
			],
		},
		"html-to-md": {
			title: "HTML to Markdown converter",
			intro: "Convert HTML pages and snippets to Markdown locally — clean text for docs and note systems.",
			detail: "Headings, lists, links, tables and code map to Markdown; scripts and styling are dropped. Feed it saved pages, documentation exports or email HTML you want in a plain-text system.",
			tip: "Deeply nested layouts and complex tables simplify rather than survive. Review the Markdown after converting — everything happens in your browser.",
			faqs: [
				{
					q: "What happens to scripts and styles?",
					a: "They are dropped. The conversion targets content structure — text, headings, lists, links, tables and code — not presentation.",
				},
				{
					q: "How do tables convert?",
					a: "Simple tables become Markdown pipe tables; deeply nested or merged-cell tables simplify. Check the output when tables matter.",
				},
				{
					q: "Is my HTML uploaded?",
					a: "No. The conversion runs in your browser; the page or snippet is processed in memory on your device.",
				},
			],
		},
		"md-to-html": {
			title: "Markdown to HTML converter",
			intro: "Turn Markdown into standalone HTML locally, ready for static sites and templates.",
			detail: "Headings, lists, code blocks and links become semantic HTML. Useful for static sites, documentation builds and anywhere a full site generator is overkill.",
			tip: "No styling is included — the output is semantic markup for your own CSS. Inline HTML written inside the Markdown is generally dropped.",
			faqs: [
				{
					q: "Does the output include CSS?",
					a: "No. You get clean semantic HTML to style with your own stylesheet.",
				},
				{
					q: "Can I use the file directly in a browser?",
					a: "Yes. The result is a standalone HTML file — it opens and renders without any build step.",
				},
				{
					q: "Which Markdown features are supported?",
					a: "The standard set: headings, lists, tables, fenced code, links and emphasis. Embedded raw HTML is generally removed.",
				},
			],
		},
		"docx-to-html": {
			title: "DOCX to HTML converter",
			intro: "Publish Word documents as HTML locally — headings, lists and tables as clean markup.",
			detail: "The conversion maps Word structure to HTML: headings, emphasis, lists, tables and links. Right for moving documents to intranets, help centres and blogs without copy-paste damage.",
			tip: "Headers, footers, text boxes and tracked changes are omitted. Check the HTML output on one representative document before publishing a batch.",
			faqs: [
				{
					q: "What happens to images?",
					a: "References may appear in the HTML, but the image files themselves are not exported. Re-add images from the original document.",
				},
				{
					q: "Is the markup clean?",
					a: "Structure maps to semantic HTML tags. Complex Word layouts simplify; review the output before publishing anything important.",
				},
				{
					q: "Is the document uploaded?",
					a: "No. The conversion engine runs in your browser via WebAssembly and the document never leaves your device.",
				},
			],
		},
		"rtf-to-docx": {
			title: "RTF to DOCX converter",
			intro: "Convert RTF documents to modern DOCX locally, without Word.",
			detail: "RTF is the 1980s rich-text format still produced by legacy applications and exporters. DOCX output opens cleanly in Word, LibreOffice and Google Docs with formatting intact.",
			tip: "Very old or exotic RTF extensions may convert imperfectly. Spot-check one file before batch converting an archive.",
			faqs: [
				{
					q: "Does the formatting survive?",
					a: "Basic rich text — bold, italic, lists, tables, colours — carries over. Exotic RTF features from niche applications may simplify.",
				},
				{
					q: "Why move from RTF to DOCX?",
					a: "RTF support is fading from software; DOCX is the modern standard every word processor handles well.",
				},
				{
					q: "Do I need Word for this?",
					a: "No. The conversion runs in your browser; the RTF is read and converted entirely on your device.",
				},
			],
		},
		"odt-to-docx": {
			title: "ODT to DOCX converter",
			intro: "Convert OpenDocument Text files to DOCX locally. LibreOffice documents, Word-ready.",
			detail: "ODT is the LibreOffice and OpenOffice format; DOCX is what offices and clients usually demand. Conversion maps styles, lists and tables so documents move between the two worlds without retyping.",
			tip: "Complex ODT features such as master documents and some frame layouts may simplify. Convert a representative sample before migrating a whole archive.",
			faqs: [
				{
					q: "How well does formatting map?",
					a: "Styles, lists and tables translate well. Very LibreOffice-specific constructs may lose some polish — check a sample first.",
				},
				{
					q: "Do I still need LibreOffice?",
					a: "Not for the conversion — it happens in your browser. LibreOffice remains handy for editing, but Word opens the result directly.",
				},
				{
					q: "Can I convert a whole folder?",
					a: "Yes. Queue the files and convert them in one run, downloading individually or as a ZIP.",
				},
			],
		},
		"epub-to-md": {
			title: "EPUB to Markdown converter",
			intro: "Extract EPUB e-book content as Markdown locally — for notes, wikis and plain-text archives.",
			detail: "Chapters become Markdown headings and paragraphs; formatting simplifies to what Markdown expresses. Useful for personal notes, plain-text reading copies and getting your own manuscripts out of e-book packaging.",
			tip: "Only DRM-free EPUB files convert. Images are not exported, and footnotes or complex layouts simplify — check the output against the book.",
			faqs: [
				{
					q: "Can I convert purchased e-books?",
					a: "Only DRM-free files. Protected store purchases fail by design; this tool processes books you own without restrictions.",
				},
				{
					q: "Do images come through?",
					a: "No — the conversion targets text. Illustrations stay in the original EPUB.",
				},
				{
					q: "How is the structure handled?",
					a: "Chapter titles become headings and body text becomes paragraphs. Endnotes, drop caps and multi-column layouts simplify to plain Markdown.",
				},
			],
		},
		"heic-converter": {
			title: "HEIC converter",
			intro: "Convert HEIC photos to JPG or PNG in your browser. The iPhone format, made universally readable — without uploads.",
			detail: "HEIC is the efficient photo format iPhones have used since iOS 11, and plenty of sites and apps still cannot read it. Pick a conversion to preselect it: JPG for smaller shareable files, PNG for lossless editing and strict upload forms.",
			tip: "A few HEIC variants may not decode — keep the original and re-export from the source device if that happens. Live Photos convert their still image; the attached video clip is a separate file.",
			faqs: [
				{
					q: "HEIC to JPG or PNG for sharing?",
					a: "JPG — universally accepted and much smaller. PNG suits editing and forms that demand lossless files.",
				},
				{
					q: "Can other devices read HEIC directly?",
					a: "Most current platforms can, but older software, web forms and peripherals often cannot. Converting to JPG or PNG removes the doubt.",
				},
				{
					q: "Are the conversions free and private?",
					a: "Both. Every tool linked here is free, needs no account, and processes photos in your browser rather than on a server.",
				},
			],
		},
		"wav-converter": {
			title: "WAV converter",
			intro: "Convert WAV audio to and from MP3, FLAC and more — locally in your browser.",
			detail: "WAV is uncompressed studio audio: huge but universal. Convert WAV to MP3 for sharing or to FLAC for lossless archives, or build WAV from MP3, M4A, FLAC, Opus — and from video — whenever an editor needs uncompressed input.",
			tip: "Mind the direction: WAV to lossy shrinks permanently, while lossy to WAV only grows files without adding quality. Keep lossless masters when the audio matters.",
			faqs: [
				{
					q: "WAV or FLAC as my archive format?",
					a: "Both are lossless; FLAC is roughly half the size and tags properly. Keep WAV only for tools that specifically require it.",
				},
				{
					q: "Which direction should I convert?",
					a: "Out of WAV when you need smaller files; into WAV when an editor or device demands uncompressed input.",
				},
				{
					q: "What bitrate for the lossy outputs?",
					a: "128 kbps suits speech, 192 kbps and above music. The workspace reports each result's size so you can weigh quality against space.",
				},
			],
		},
		"flac-converter": {
			title: "FLAC converter",
			intro: "Convert FLAC to MP3 or WAV — and into FLAC from MP3 or WAV — in your browser.",
			detail: "FLAC is the lossless archive format: every sample preserved at about half the size of WAV. Convert FLAC to MP3 for portable copies, to WAV for editors, or into FLAC from WAV losslessly or from MP3 as a container upgrade.",
			tip: "MP3 to FLAC wraps existing quality and never restores it. Keep FLAC masters — they re-encode cleanly to whatever format you need next.",
			faqs: [
				{
					q: "Is FLAC worth it compared to MP3?",
					a: "For archiving, yes — perfect quality that re-encodes to anything later. For portability and size, MP3 still wins; many people keep both.",
				},
				{
					q: "Can converting MP3 to FLAC fix the quality?",
					a: "No. The FLAC stores the MP3's decoded output exactly; the earlier lossy encoding is permanent.",
				},
				{
					q: "What plays FLAC files?",
					a: "Most current software, phones and many dedicated players. The exceptions are the reason MP3 copies still exist.",
				},
			],
		},
		"mp3-to-ogg": {
			title: "MP3 to OGG converter",
			intro: "Convert MP3 audio to OGG (Vorbis) in your browser, in batches, without uploads.",
			detail: "OGG Vorbis is the open audio format favoured by game engines, Linux tools and web embedding. This conversion decodes your MP3 and encodes OGG; it cannot restore quality the MP3 already lost, but Vorbis often matches MP3 audibility at similar or smaller sizes.",
			tip: "Plenty of apps and car stereos still lack Vorbis support \u2014 keep the MP3 when universal playback matters more than an open format.",
			faqs: [
				{
					q: "Why convert MP3 to OGG?",
					a: "OGG is patent-free and standard in game development, open-source players and HTML5 audio pipelines. Convert when a project or platform requires Vorbis specifically.",
				},
				{
					q: "Will quality suffer?",
					a: "It is one lossy encoding stacked on another, so treat this as a format change, not an upgrade. At moderate bitrates Vorbis is efficient and the difference is subtle.",
				},
				{
					q: "Does the conversion work offline?",
					a: "After the first conversion downloads and caches the audio engine, converting works offline. Files never leave your device.",
				},
			],
		},
		"jpg-to-webp": {
			title: "JPG to WebP converter",
			intro: "Convert JPG photos to WebP locally. Slim websites and storage with a modern format, no uploads.",
			detail: "WebP usually compresses the same image smaller than JPG at comparable quality. Choose a quality level, convert, and compare the reported size change before replacing your originals.",
			tip: "Conversion cannot add quality \u2014 an old, heavily compressed JPG stays that way in WebP. Keep JPG masters when very old software must open the files.",
			faqs: [
				{
					q: "Is WebP really smaller than JPG?",
					a: "Typically yes, around 20\u201330% at similar quality. The workspace reports each result's actual size, so judge per image rather than assuming.",
				},
				{
					q: "Does JPG to WebP keep transparency?",
					a: "Your JPG has no transparency to keep \u2014 the WebP result will be fully opaque. WebP supports alpha only when the source image has it.",
				},
				{
					q: "Which quality setting suits photos?",
					a: "75\u201385 is the usual range for photographs. Check fine text and edges at full size before lowering it further.",
				},
			],
		},
		"png-to-ico": {
			title: "PNG to ICO converter",
			intro: "Convert PNG images to ICO locally. Turn logos into favicons and Windows icons without design software.",
			detail: "ICO is the icon format behind browser favicons and Windows shortcuts. This conversion encodes your PNG as an ICO that sites and applications accept, preserving transparency.",
			tip: "Favicons read best from square sources \u2014 crop to a square first. Multi-size ICO packaging is not included here; generate the size you need and ship it as favicon.ico.",
			faqs: [
				{
					q: "Is this a favicon generator?",
					a: "It produces the ICO file itself. Rename it to favicon.ico and place it at your site's root, or reference it in your pages.",
				},
				{
					q: "Is transparency preserved?",
					a: "Yes \u2014 PNG alpha channels carry into the ICO, which is what makes rounded or shaped icons look right.",
				},
				{
					q: "What PNG size should I start from?",
					a: "A square image of 256\u00d7256 pixels or larger gives the cleanest downscale to 16\u201348 px icon sizes.",
				},
			],
		},
		"jpg-to-ico": {
			title: "JPG to ICO converter",
			intro: "Convert JPG images to ICO locally for favicons and Windows icons, without design software.",
			detail: "ICO files can carry transparency, JPG cannot \u2014 your icon keeps a flattened background. For logos that need transparent corners, start from the PNG master instead with the PNG to ICO page.",
			tip: "Square, high-contrast sources stay readable at 16\u201348 px favicon sizes. Keep the JPG original; the ICO is a generated asset you can regenerate any time.",
			faqs: [
				{
					q: "Why did my background turn white?",
					a: "JPG has no transparency, so nothing can be preserved \u2014 the icon is fully opaque. Use a PNG source when the shape needs transparent edges.",
				},
				{
					q: "Which sizes does the ICO have?",
					a: "It is a single-size icon built from your image. Scale to a square before converting for the best small-size rendering.",
				},
				{
					q: "Can I use it as my favicon?",
					a: "Yes. Name it favicon.ico and place it at the site root, or link it from your pages.",
				},
			],
		},
		"gif-to-png": {
			title: "GIF to PNG converter",
			intro: "Convert GIF images to PNG locally. Extract a clean still frame from any GIF, without uploads.",
			detail: "Animated GIFs convert to a still image \u2014 the opening frame \u2014 as a lossless PNG with transparency preserved. Static GIF images convert directly, pixel for pixel.",
			tip: "Need a different frame? Pull it out in an editor first \u2014 this conversion always takes the first frame. PNG keeps the transparency the GIF format carries, where JPG would flatten it.",
			faqs: [
				{
					q: "What happens to the animation?",
					a: "It becomes a single still image of the first frame. Animated output is not produced here.",
				},
				{
					q: "Is the conversion lossless?",
					a: "Yes \u2014 the decoded frame is stored exactly as PNG stores it, with no further quality loss.",
				},
				{
					q: "Can I convert many GIFs at once?",
					a: "Yes. Add the whole batch; each file converts with the same settings and downloads individually or as a ZIP.",
				},
			],
		},
		"gif-to-jpg": {
			title: "GIF to JPG converter",
			intro: "Convert GIF images to JPG in your browser \u2014 smaller stills for sharing and upload forms.",
			detail: "The first frame of the GIF is encoded as JPG at a quality you choose. Transparency flattens onto white and the result is a plain still image suited to previews and size-limited forms.",
			tip: "When the frame must stay transparent or pixel-exact, use the GIF to PNG page instead \u2014 JPG suits photographic-style frames best.",
			faqs: [
				{
					q: "Does the animation survive?",
					a: "No \u2014 you get a still image of the first frame as a JPG.",
				},
				{
					q: "Why is my transparent background white?",
					a: "JPG has no transparency support, so transparent areas flatten onto white. Choose the GIF to PNG page to keep them.",
				},
				{
					q: "Which quality should I choose?",
					a: "80\u201390 suits most stills. Lower settings shrink files further but soften edges \u2014 check the result before batch converting.",
				},
			],
		},
		"compress-png": {
			title: "PNG compressor",
			intro: "Compress PNG images locally and compare the real savings. Same format in, smaller file out.",
			detail: "This page re-encodes PNG with the workspace's quality settings: lossless mode keeps every pixel exact, while lower settings trade some fidelity for much smaller files. Each file reports its actual before-and-after size.",
			tip: "Re-encoding does not guarantee savings \u2014 already-optimized PNGs may barely shrink. Trust the workspace numbers and keep the original when a file refuses to get smaller.",
			faqs: [
				{
					q: "Is the compression lossless?",
					a: "Your choice: the lossless quality mode keeps pixels identical, while reduced quality settings shrink files further at the cost of some fidelity.",
				},
				{
					q: "Why won't my PNG get smaller?",
					a: "It was probably saved by an already-optimized pipeline \u2014 there is little redundancy left to remove. The workspace will show barely any change.",
				},
				{
					q: "Would WebP be smaller still?",
					a: "Often, yes \u2014 but PNG stays the right answer when a form or workflow requires the format. Try the image compressor page to compare formats.",
				},
			],
		},
		"compress-jpeg": {
			title: "JPEG compressor",
			intro: "Compress JPG images locally. Choose a lower quality level and watch the real size drop, no uploads.",
			detail: "JPG compression is quality-driven: re-encoding at a lower setting discards more data and shrinks the file, with artifacts you control. The workspace shows each file's size change so you can decide per image.",
			tip: "Every JPG re-encode compounds artifacts \u2014 work from originals when you plan several passes. Around 70\u201385 suits most photos; go lower only for thumbnails.",
			faqs: [
				{
					q: "How much smaller will my JPGs get?",
					a: "Commonly 30\u201360% at moderate quality settings, depending on how the original was saved. The workspace reports the real numbers.",
				},
				{
					q: "Does compressing lose quality?",
					a: "Yes \u2014 permanently. Inspect fine text and edges at full size before replacing an original with a smaller copy.",
				},
				{
					q: "Does the resolution change?",
					a: "No. Compression only changes how aggressively the pixels are encoded; image dimensions stay exactly the same.",
				},
			],
		},
		"mp3-compressor": {
			title: "MP3 compressor",
			intro: "Shrink MP3 files locally by re-encoding at a lower bitrate. Voice notes and podcasts fit anywhere.",
			detail: "Pick a lower bitrate in the conversion settings \u2014 128 kbps or less suits speech, 192 kbps keeps music comfortable \u2014 and the workspace reports each file's new size. The audio is decoded and re-encoded, so choose the lowest bitrate that still sounds right.",
			tip: "Re-encoding cannot restore what the first MP3 discarded, and stacking encodings adds artifacts. For large permanent savings, re-encode from lossless originals when you have them.",
			faqs: [
				{
					q: "How much smaller will my MP3s get?",
					a: "Going from 320 to 128 kbps cuts roughly 60% of the size; speech at 64 kbps shrinks far more. The workspace shows the exact result.",
				},
				{
					q: "Which bitrate should I pick?",
					a: "128 kbps is a solid default, 96 or 64 kbps works for voice, and 192 kbps or above keeps music comfortable.",
				},
				{
					q: "Does compressing hurt the sound?",
					a: "Lower bitrates add artifacts, and re-encoding an MP3 stacks on its existing compression. Test one file per content type before batching a library.",
				},
			],
		},
		"ico-converter": {
			title: "ICO converter",
			intro: "Convert icons to and from ICO in your browser. Favicons and Windows icons, no design tools, no uploads.",
			detail: "ICO bundles an icon for browsers and Windows. Convert PNG or JPG into ICO for favicons, or decode an existing ICO into PNG to view and reuse it \u2014 every tool below runs locally in your browser.",
			tip: "Work from square, high-resolution sources for crisp small sizes. Transparency is preserved from PNG sources; JPG icons keep a flattened background.",
			faqs: [
				{
					q: "What is the ICO format for?",
					a: "Browser favicons and Windows application icons. It stores an image in the exact container those systems expect.",
				},
				{
					q: "Does it produce multi-size ICO files?",
					a: "Each conversion produces a single-size icon. Teams that need multi-resolution bundles typically generate the sizes and combine them in their build tooling.",
				},
				{
					q: "Are the conversions free and private?",
					a: "Both. Every tool linked here is free, needs no account, and processes images in your browser rather than on a server.",
				},
			],
		},
		"audio-extractor": {
			title: "Audio extractor",
			hubFromTitle: "Extract audio from any video",
			intro: "Extract audio from any video in your browser. MP4, WebM, MOV, MKV, AVI and more \u2014 to MP3 or WAV, without uploading.",
			detail: "Pick your video format below and the workspace opens with that conversion preselected: MP4, WebM, MOV, MKV, AVI, WMV or FLV to MP3, or uncompressed WAV for editing. Only the audio stream is decoded and your video files stay on the device.",
			tip: "The extracted audio inherits the source's quality ceiling \u2014 extraction cannot improve it. Choose WAV when the audio is headed for editing; choose MP3 for listening and sharing.",
			faqs: [
				{
					q: "Which video formats are supported?",
					a: "MP4 and M4V, WebM, MOV, MKV, AVI, WMV and FLV \u2014 each has a dedicated page with format-specific guidance.",
				},
				{
					q: "Which audio track gets extracted?",
					a: "The first audio track in the file. For files with commentary or alternate tracks, check one result before batch converting.",
				},
				{
					q: "How large a video can I extract from?",
					a: "Browser memory sets the ceiling \u2014 the file buffer tops out just under 2 GiB. Long recordings on low-RAM devices may fail.",
				},
			],
		},
	},
};
