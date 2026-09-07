export interface ToolCopy {
	title: string;
	intro: string;
	detail: string;
	tip: string;
}
interface SeoCopy {
	home: string;
	description: string;
	directory: string;
	guide: string;
	notes: string;
	related: string;
	languages: string;
	steps: string[];
	pages: Record<string, [string, string]>;
	tools: Record<string, ToolCopy>;
}
export const content: Record<string, SeoCopy> = {
	en: {
		home: "Local file conversion, in your browser",
		description:
			"Convert images, audio and documents in batches. Export PDF pages as images and use WebP or AVIF. Files stay in your browser; no file uploads.",
		directory: "Choose a conversion",
		guide: "How to use this tool",
		notes: "Quality and format notes",
		related: "More local tools",
		languages: "Languages",
		steps: [
			"Choose files or drag them into the workspace. Matching inputs get the output format shown on this page.",
			"Check the output format and image quality for each file. Existing files in your queue keep their settings.",
			"Start the conversion, then download individual results or the completed batch. Your original files are unchanged.",
		],
		pages: {
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
			},
			"png-to-webp": {
				title: "PNG to WebP converter",
				intro: "Convert PNG images to WebP locally. Batch-process screenshots and web graphics without uploading the originals.",
				detail: "WebP supports transparency and can reduce the size of many PNG images. Balanced quality is a useful starting point for web images; compare fine text and edges before choosing a lower quality setting.",
				tip: "A smaller result is not guaranteed, especially for tiny or already optimized images. The workspace reports the actual size change. Choose the lossless quality mode when exact decoded pixels matter.",
			},
			"png-to-avif": {
				title: "PNG to AVIF converter",
				intro: "Create AVIF images from PNG files in your browser. Adjust quality and compare the resulting file size before downloading.",
				detail: "AVIF supports transparency and efficient lossy compression, but encoding can take longer than WebP. For photos and detailed images, begin with balanced quality and inspect the result at its intended display size.",
				tip: "AVIF can be larger than the original when lossless or maximum quality is selected, or when the image is small or unusually simple. Quality numbers are not directly comparable between formats; compare both appearance and actual bytes.",
			},
			"pdf-to-png": {
				title: "PDF to PNG converter",
				intro: "Render PDF pages as PNG images locally. Download one page directly or multiple pages together in a numbered ZIP.",
				detail: "Pages are rendered at 144 DPI. PNG avoids additional lossy image compression and is useful for text, diagrams and screenshots. This is a rendered image export, not OCR or extraction of editable document text.",
				tip: "The current PDF limits include 200 pages and 100 MiB of input; page dimensions, output size and available memory also apply. Password-protected PDFs are not supported. Use JPG or WebP if PNG page images are too large.",
			},
			"pdf-to-jpg": {
				title: "PDF to JPG converter",
				intro: "Convert PDF pages to JPG images in your browser. Export a single page or download a numbered ZIP for a multi-page document.",
				detail: "The tool renders pages at 144 DPI, then encodes them as JPG. JPG is useful for sharing photographic pages; compression may introduce artifacts around small text. Adjust image quality before converting.",
				tip: "JPG cannot preserve transparency; transparent areas are flattened onto white. Choose PNG for crisp diagrams. Password-protected PDFs are unsupported, and the PDF page, memory and output limits still apply.",
			},
			"image-compressor": {
				title: "Batch image compressor",
				intro: "Reduce image file sizes locally and compare the actual savings. This tool starts with WebP output; you can change the format and quality.",
				detail: "Add JPG, PNG, WebP, AVIF or TIFF images, then choose quality appropriate for their use. Photos, screenshots and icons compress differently. Inspect fine detail before replacing an original with a smaller result.",
				tip: "Re-encoding does not always save space. Z8.Work shows both reductions and increases; it does not claim every conversion is smaller. Storage carbon figures are conditional estimates, not measured net emissions avoided.",
			},
		},
	},
	"zh-Hans": {
		home: "本地多文件转换处理工具",
		description:
			"免费批量转换图片、音频和文档，支持 WebP、AVIF 和 PDF 转图片。文件在浏览器本地处理，无需上传。",
		directory: "选择转换工具",
		guide: "使用方法",
		notes: "画质与格式说明",
		related: "更多本地转换工具",
		languages: "页面语言",
		steps: [
			"选择文件或拖入工作区。符合本页输入类型的文件会自动选好输出格式。",
			"检查各文件的输出格式和画质。队列中已有文件的设置会保留。",
			"开始转换，完成后单独下载或批量打包下载。原始文件不会被修改。",
		],
		pages: {
			"/about/": [
				"关于 Z8.Work",
				"了解基于 VERT 开发的开源本地文件转换工具、浏览器处理方式、支持范围和项目源码。",
			],
			"/privacy/": [
				"隐私保护与本地处理",
				"了解 Z8.Work 如何在本地处理文件、上传流量 0 B 的含义，以及网站资源加载仍会产生哪些网络请求。",
			],
			"/environment/": [
				"图片压缩与存储环境影响",
				"了解图片体积节省和存储碳排放估算，以及计算使用的假设、数据来源和适用限制。",
			],
			"/acknowledgements/": [
				"感谢 VERT.SH 项目",
				"感谢 VERT.SH 项目及各位开发者。Z8.Work 是站在巨人的肩膀上的项目。查看源代码和联系邮箱。",
			],
			"/settings/": [
				"转换设置",
				"调整图片画质、音频输出、界面外观和本地转换引擎缓存。",
			],
			"/convert/": [
				"文件转换工作区",
				"管理本地文件队列，选择输出格式、批量转换并下载结果。",
			],
		},
		tools: {
			"heic-to-jpg": {
				title: "HEIC 转 JPG",
				intro: "在浏览器本地将 HEIC、HEIF 照片转换为 JPG，支持单张与批量处理，照片无需上传。",
				detail: "JPG 适合邮件附件和不接受 HEIC 的网站。本页会为 HEIC、HEIF 输入预选 JPG，原始照片仍保留在设备上。JPG 使用有损压缩，较高画质通常会产生更大的文件。",
				tip: "JPG 不支持透明背景；需要透明度时请改选 PNG 或 WebP。部分 HEIC 编码变体可能无法解码，失败时请保留原图，并尝试从原设备重新导出。",
			},
			"png-to-webp": {
				title: "PNG 转 WebP",
				intro: "本地批量将 PNG 图片转换为 WebP，适合截图和网页素材，原图不会上传到服务器。",
				detail: "WebP 支持透明背景，许多 PNG 图片转换后可以减小体积。网页图片可以先使用均衡画质；降低画质前，建议检查小字、线条和边缘是否清晰。",
				tip: "体积不一定变小，小图片或已经优化过的文件尤其如此。工作区会展示实际体积变化；需要保留精确解码像素时，可以选择无损画质模式。",
			},
			"png-to-avif": {
				title: "PNG 转 AVIF",
				intro: "在浏览器中将 PNG 转换为 AVIF，自由调整画质，并在下载前比较转换后的文件大小。",
				detail: "AVIF 支持透明度和高效有损压缩，但编码耗时可能高于 WebP。对于照片和细节丰富的图片，建议从均衡画质开始，按实际展示尺寸检查转换结果。",
				tip: "选择无损或最高画质、图片尺寸很小或内容简单时，AVIF 可能比原图更大。不同格式的画质数值不能直接横向比较，应同时比较视觉效果和实际字节数。",
			},
			"pdf-to-png": {
				title: "PDF 转 PNG 图片",
				intro: "在本地将 PDF 页面渲染为 PNG 图片。单页直接下载，多页按页码打包为 ZIP，无需上传 PDF。",
				detail: "页面以 144 DPI 渲染。PNG 不会再引入有损图片压缩，适合文字、图表和截图。这是页面图片导出，不是 OCR，也不是提取可编辑文档文字。",
				tip: "目前 PDF 输入上限为 100 MiB、200 页，同时受页面像素、输出体积和设备内存限制。不支持密码保护的 PDF；如果 PNG 结果过大，可改选 JPG 或 WebP。",
			},
			"pdf-to-jpg": {
				title: "PDF 转 JPG 图片",
				intro: "在浏览器本地将 PDF 页面转换为 JPG。单页直接导出，多页文档生成按页码排列的 ZIP 文件。",
				detail: "工具先以 144 DPI 渲染页面，再编码为 JPG。JPG 适合分享以照片为主的页面，但压缩可能影响细小文字的边缘，可在转换前调整图片画质。",
				tip: "JPG 不保留透明度，透明区域会铺为白色背景。需要清晰图表时可以改用 PNG。不支持密码保护的 PDF，页数、内存与输出体积限制仍然适用。",
			},
			"image-compressor": {
				title: "图片批量压缩工具",
				intro: "在本地压缩图片并比较实际节省的空间。默认输出 WebP，可自行更换格式和画质，图片无需上传。",
				detail: "添加 JPG、PNG、WebP、AVIF 或 TIFF 图片，按用途选择画质。照片、截图和图标的压缩表现不同，用较小文件替换原图之前，建议先检查细节。",
				tip: "重新编码不保证体积降低。Z8.Work 会同时显示节省或增加的空间；存储碳排放数字是附带条件的估算，不代表测量或核证的净减排。",
			},
		},
	},
	"zh-Hant": {
		home: "本機多檔案轉換處理工具",
		description:
			"免費批次轉換圖片、音訊和文件，支援 WebP、AVIF 和 PDF 轉圖片。檔案在瀏覽器本機處理，無須上傳。",
		directory: "選擇轉換工具",
		guide: "使用方法",
		notes: "畫質與格式說明",
		related: "更多本機轉換工具",
		languages: "頁面語言",
		steps: [
			"選擇檔案或拖入工作區。符合本頁輸入類型的檔案會自動選好輸出格式。",
			"檢查各檔案的輸出格式和畫質。佇列中既有檔案的設定會保留。",
			"開始轉換，完成後個別下載或批次打包下載。原始檔案不會被修改。",
		],
		pages: {
			"/about/": [
				"關於 Z8.Work",
				"了解基於 VERT 開發的開源本機檔案轉換工具、瀏覽器處理方式、支援範圍和專案原始碼。",
			],
			"/privacy/": [
				"隱私保護與本機處理",
				"了解 Z8.Work 如何在本機處理檔案、上傳流量 0 B 的含義，以及網站資源載入仍會產生哪些網路請求。",
			],
			"/environment/": [
				"圖片壓縮與儲存環境影響",
				"了解圖片大小節省和儲存碳排放估算，以及計算使用的假設、資料來源和適用限制。",
			],
			"/acknowledgements/": [
				"感謝 VERT.SH 專案",
				"感謝 VERT.SH 專案及各位開發者。Z8.Work 是站在巨人的肩膀上的專案。查看原始碼和聯絡信箱。",
			],
			"/settings/": [
				"轉換設定",
				"調整圖片畫質、音訊輸出、介面外觀和本機轉換引擎快取。",
			],
			"/convert/": [
				"檔案轉換工作區",
				"管理本機檔案佇列，選擇輸出格式、批次轉換並下載結果。",
			],
		},
		tools: {
			"heic-to-jpg": {
				title: "HEIC 轉 JPG",
				intro: "在瀏覽器本機將 HEIC、HEIF 照片轉換為 JPG，支援單張與批次處理，照片無須上傳。",
				detail: "JPG 適合郵件附件和不接受 HEIC 的網站。本頁會為 HEIC、HEIF 輸入預選 JPG，原始照片仍保留在裝置上。JPG 使用有損壓縮，較高畫質通常會產生更大的檔案。",
				tip: "JPG 不支援透明背景；需要透明度時請改選 PNG 或 WebP。部分 HEIC 編碼變體可能無法解碼，失敗時請保留原圖，並嘗試從原裝置重新匯出。",
			},
			"png-to-webp": {
				title: "PNG 轉 WebP",
				intro: "本機批次將 PNG 圖片轉換為 WebP，適合螢幕擷取和網頁素材，原圖不會上傳至伺服器。",
				detail: "WebP 支援透明背景，許多 PNG 圖片轉換後可以減小體積。網頁圖片可以先使用均衡畫質；降低畫質前，建議檢查小字、線條和邊緣是否清晰。",
				tip: "體積不一定變小，小圖片或已經最佳化的檔案尤其如此。工作區會展示實際大小變化；需要保留精確解碼像素時，可以選擇無損畫質模式。",
			},
			"png-to-avif": {
				title: "PNG 轉 AVIF",
				intro: "在瀏覽器中將 PNG 轉換為 AVIF，自由調整畫質，並在下載前比較轉換後的檔案大小。",
				detail: "AVIF 支援透明度和高效有損壓縮，但編碼耗時可能高於 WebP。對於照片和細節豐富的圖片，建議從均衡畫質開始，按實際顯示尺寸檢查轉換結果。",
				tip: "選擇無損或最高畫質、圖片尺寸很小或內容簡單時，AVIF 可能比原圖更大。不同格式的畫質數值不能直接比較，應同時比較視覺效果和實際位元組數。",
			},
			"pdf-to-png": {
				title: "PDF 轉 PNG 圖片",
				intro: "在本機將 PDF 頁面繪製為 PNG 圖片。單頁直接下載，多頁按頁碼打包為 ZIP，無須上傳 PDF。",
				detail: "頁面以 144 DPI 繪製。PNG 不會再引入有損圖片壓縮，適合文字、圖表和螢幕擷取。這是頁面圖片匯出，不是 OCR，也不是擷取可編輯文件文字。",
				tip: "目前 PDF 輸入上限為 100 MiB、200 頁，同時受頁面像素、輸出大小和裝置記憶體限制。不支援密碼保護的 PDF；如果 PNG 結果過大，可改選 JPG 或 WebP。",
			},
			"pdf-to-jpg": {
				title: "PDF 轉 JPG 圖片",
				intro: "在瀏覽器本機將 PDF 頁面轉換為 JPG。單頁直接匯出，多頁文件產生按頁碼排列的 ZIP 檔案。",
				detail: "工具先以 144 DPI 繪製頁面，再編碼為 JPG。JPG 適合分享以照片為主的頁面，但壓縮可能影響細小文字的邊緣，可在轉換前調整圖片畫質。",
				tip: "JPG 不保留透明度，透明區域會鋪為白色背景。需要清晰圖表時可以改用 PNG。不支援密碼保護的 PDF，頁數、記憶體與輸出大小限制仍然適用。",
			},
			"image-compressor": {
				title: "圖片批次壓縮工具",
				intro: "在本機壓縮圖片並比較實際節省的空間。預設輸出 WebP，可自行更換格式和畫質，圖片無須上傳。",
				detail: "加入 JPG、PNG、WebP、AVIF 或 TIFF 圖片，按用途選擇畫質。照片、螢幕擷取和圖示的壓縮表現不同，用較小檔案替換原圖之前，建議先檢查細節。",
				tip: "重新編碼不保證體積降低。Z8.Work 會同時顯示節省或增加的空間；儲存碳排放數字是附帶條件的估算，不代表測量或核證的淨減排。",
			},
		},
	},
	es: {
		home: "Conversión local de archivos en tu navegador",
		description:
			"Convierte imágenes, audio y documentos por lotes. Exporta páginas PDF como imágenes y utiliza WebP o AVIF. Tus archivos no se suben a un servidor.",
		directory: "Elige una conversión",
		guide: "Cómo utilizar la herramienta",
		notes: "Calidad y formatos",
		related: "Más herramientas locales",
		languages: "Idiomas",
		steps: [
			"Selecciona archivos o arrástralos al área de trabajo. Las entradas compatibles reciben el formato de salida indicado en esta página.",
			"Revisa el formato y la calidad de cada archivo. Los archivos que ya estaban en la cola conservan sus ajustes.",
			"Inicia la conversión y descarga los resultados por separado o en un lote. Los archivos originales no se modifican.",
		],
		pages: {
			"/about/": [
				"Acerca de Z8.Work",
				"Conoce este conversor de archivos de código abierto basado en VERT, su procesamiento local, los formatos disponibles y su código fuente.",
			],
			"/privacy/": [
				"Privacidad y procesamiento local",
				"Cómo procesa Z8.Work tus archivos localmente, qué significa el indicador de 0 B subidos y qué recursos del sitio utilizan la red.",
			],
			"/environment/": [
				"Compresión de imágenes e impacto del almacenamiento",
				"Comprende el ahorro de espacio y las estimaciones condicionales de carbono, sus supuestos, fuentes y limitaciones.",
			],
			"/acknowledgements/": [
				"Gracias al proyecto VERT.SH",
				"Gracias al proyecto VERT.SH y a todos sus desarrolladores. Z8.Work se apoya en los hombros de gigantes. Consulta el código fuente y el correo de contacto.",
			],
			"/settings/": [
				"Ajustes de conversión",
				"Ajusta la calidad de imagen, la salida de audio, la apariencia y la caché local de los motores.",
			],
			"/convert/": [
				"Área de conversión",
				"Gestiona tu cola de archivos locales, elige formatos de salida, convierte y descarga los resultados.",
			],
		},
		tools: {
			"heic-to-jpg": {
				title: "Convertir HEIC a JPG",
				intro: "Convierte fotos HEIC y HEIF a JPG en tu navegador, una a una o por lotes, sin subirlas a un servidor.",
				detail: "JPG resulta útil para adjuntar fotos o utilizar servicios que no aceptan HEIC. Esta página selecciona JPG para entradas HEIC y HEIF; las fotos originales permanecen en tu dispositivo. Una calidad más alta puede producir archivos más grandes.",
				tip: "JPG no admite transparencia: elige PNG o WebP si la necesitas. Algunas variantes HEIC pueden no decodificarse; conserva el original y prueba otra exportación desde el dispositivo de origen si falla.",
			},
			"png-to-webp": {
				title: "Convertir PNG a WebP",
				intro: "Convierte imágenes PNG a WebP localmente. Procesa capturas y gráficos web por lotes sin subir los originales.",
				detail: "WebP admite transparencia y puede reducir el tamaño de muchas imágenes PNG. La calidad equilibrada es un buen punto de partida; revisa el texto pequeño y los bordes antes de reducirla.",
				tip: "El resultado no siempre será más pequeño, especialmente con imágenes diminutas o ya optimizadas. El área de trabajo muestra el cambio real. Elige el modo sin pérdida cuando necesites conservar los píxeles decodificados.",
			},
			"png-to-avif": {
				title: "Convertir PNG a AVIF",
				intro: "Crea imágenes AVIF a partir de PNG en tu navegador. Ajusta la calidad y compara el tamaño antes de descargar.",
				detail: "AVIF admite transparencia y compresión con pérdida eficiente, pero puede tardar más en codificarse que WebP. Para fotografías detalladas, empieza con calidad equilibrada y revisa el resultado al tamaño de visualización previsto.",
				tip: "AVIF puede superar el tamaño original con calidad máxima o sin pérdida, o con imágenes pequeñas o sencillas. Los valores de calidad no son equivalentes entre formatos: compara tanto la apariencia como los bytes.",
			},
			"pdf-to-png": {
				title: "Convertir PDF a PNG",
				intro: "Convierte páginas PDF en imágenes PNG localmente. Descarga una página directamente o varias en un ZIP numerado.",
				detail: "Las páginas se renderizan a 144 ppp. PNG evita añadir compresión de imagen con pérdida y es adecuado para texto, diagramas y capturas. Esta exportación no realiza OCR ni extrae texto editable.",
				tip: "Los límites actuales incluyen 200 páginas y 100 MiB de entrada; también se aplican límites de píxeles, salida y memoria. No se admiten PDF protegidos con contraseña. Prueba JPG o WebP si los PNG son demasiado grandes.",
			},
			"pdf-to-jpg": {
				title: "Convertir PDF a JPG",
				intro: "Convierte páginas PDF a JPG en tu navegador. Exporta una página o descarga un ZIP numerado para documentos de varias páginas.",
				detail: "La herramienta renderiza las páginas a 144 ppp y después las codifica como JPG. Es útil para páginas fotográficas, aunque la compresión puede afectar al texto pequeño. Ajusta la calidad antes de convertir.",
				tip: "JPG no conserva transparencia: las zonas transparentes se aplanan sobre blanco. Elige PNG para diagramas nítidos. No se admiten PDF protegidos con contraseña y se aplican límites de páginas, memoria y salida.",
			},
			"image-compressor": {
				title: "Compresor de imágenes por lotes",
				intro: "Reduce el tamaño de imágenes localmente y compara el ahorro real. La salida inicial es WebP; puedes cambiar el formato y la calidad.",
				detail: "Añade imágenes JPG, PNG, WebP, AVIF o TIFF y ajusta la calidad a su uso. Las fotos, capturas e iconos se comprimen de manera diferente. Comprueba los detalles antes de reemplazar un original por un resultado más pequeño.",
				tip: "Volver a codificar no siempre ahorra espacio. Z8.Work muestra tanto reducciones como aumentos. Las cifras de carbono del almacenamiento son estimaciones condicionales, no mediciones de emisiones netas evitadas.",
			},
		},
	},
};

export function seoCopy(locale: string): SeoCopy {
	return content[locale] ?? content.en;
}
