import type { SeoCopy } from "$lib/seo/copy-types";

export const es: SeoCopy = {
	home: "Conversión local de archivos en tu navegador",
	description:
		"Convierte imágenes, audio y documentos por lotes. Exporta páginas PDF como imágenes y utiliza WebP o AVIF. Tus archivos no se suben a un servidor.",
	directory: "Elige una conversión",
	guide: "Cómo utilizar la herramienta",
	notes: "Calidad y formatos",
	related: "Más herramientas locales",
	languages: "Idiomas",
	faq: "Preguntas frecuentes",
	hubFrom: "Convertir desde {name}",
	hubTo: "Convertir a {name}",
	otherConverters: "Otros conversores",

	formatGuides: "Guías de formato",
	picker: {
		from: "Convertir desde",
		to: "a",
		browse: "Ver todas las herramientas de conversión",
		toControl: "Formato de destino",
	},
	groups: {
		image: "Imágenes",
		audio: "Audio",
		video: "Vídeo a audio",
		doc: "Documentos",
		pdf: "PDF",
	},
	steps: [
		"Selecciona archivos o arrástralos al área de trabajo. Las entradas compatibles reciben el formato de salida indicado en esta página.",
		"Revisa el formato y la calidad de cada archivo. Los archivos que ya estaban en la cola conservan sus ajustes.",
		"Inicia la conversión y descarga los resultados por separado o en un lote. Los archivos originales no se modifican.",
	],
	stepsHub: [
		"Añade archivos o arrástralos al área de trabajo. No se sube nada; todo se procesa en tu navegador.",
		"Elige un formato de salida —y para imágenes y audio, una calidad— para cada archivo. Aquí no hay ningún formato preseleccionado.",
		"Inicia la conversión y descarga los resultados por separado o en un lote.",
	],
	pages: {
		"/tools/": [
			"Todas las herramientas de conversión",
			"Explora todas las conversiones locales: herramientas de imagen, audio, vídeo a audio y documentos, además de guías de formato. Los archivos se quedan en tu navegador.",
		],
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
			faqs: [
				{
					q: "¿Convertir HEIC a JPG reduce la calidad?",
					a: "JPG descarta datos de imagen al codificar. Con calidad equilibrada la diferencia apenas se percibe, y el área de trabajo muestra el cambio de tamaño de cada archivo. Tus fotos HEIC originales no se modifican.",
				},
				{
					q: "¿Por qué algunas fotos de iPhone no se convierten?",
					a: "Algunas variantes HEIC, como ciertas exportaciones HDR o de ráfaga, pueden no decodificarse en el navegador. Conserva el original, reexporta la foto desde el dispositivo que la tomó e inténtalo de nuevo.",
				},
				{
					q: "¿Necesito instalar algo?",
					a: "No. La conversión funciona en tu navegador con WebAssembly; el motor se descarga en el primer uso y queda en caché. Las fotos se procesan en tu dispositivo y nunca se suben.",
				},
			],
		},
		"png-to-webp": {
			title: "Convertir PNG a WebP",
			intro: "Convierte imágenes PNG a WebP localmente. Procesa capturas y gráficos web por lotes sin subir los originales.",
			detail: "WebP admite transparencia y puede reducir el tamaño de muchas imágenes PNG. La calidad equilibrada es un buen punto de partida; revisa el texto pequeño y los bordes antes de reducirla.",
			tip: "El resultado no siempre será más pequeño, especialmente con imágenes diminutas o ya optimizadas. El área de trabajo muestra el cambio real. Elige el modo sin pérdida cuando necesites conservar los píxeles decodificados.",
			faqs: [
				{
					q: "¿WebP siempre ocupa menos que PNG?",
					a: "No. Las imágenes pequeñas, los iconos y los PNG ya optimizados pueden quedar igual o más grandes. Guíate por el cambio de tamaño real que muestra el área de trabajo para cada archivo.",
				},
				{
					q: "¿WebP conserva la transparencia?",
					a: "Sí. Tanto el WebP con pérdida como el sin pérdida admiten canal alfa, así que las zonas transparentes de tu PNG sobreviven a la conversión.",
				},
				{
					q: "¿Qué calidad debo elegir?",
					a: "Empieza con calidad equilibrada para gráficos web. Si la imagen tiene texto pequeño o bordes finos, inspecciónalos a tamaño completo antes de bajar la calidad; usa sin pérdida cuando los píxeles deban coincidir exactamente.",
				},
			],
		},
		"png-to-avif": {
			title: "Convertir PNG a AVIF",
			intro: "Crea imágenes AVIF a partir de PNG en tu navegador. Ajusta la calidad y compara el tamaño antes de descargar.",
			detail: "AVIF admite transparencia y compresión con pérdida eficiente, pero puede tardar más en codificarse que WebP. Para fotografías detalladas, empieza con calidad equilibrada y revisa el resultado al tamaño de visualización previsto.",
			tip: "AVIF puede superar el tamaño original con calidad máxima o sin pérdida, o con imágenes pequeñas o sencillas. Los valores de calidad no son equivalentes entre formatos: compara tanto la apariencia como los bytes.",
			faqs: [
				{
					q: "¿AVIF o WebP, cuál elegir?",
					a: "AVIF suele lograr archivos más pequeños con la misma calidad visual, pero codifica más despacio; WebP es más rápido y algo más compatible. Convierte una imagen a ambos y compara los tamaños.",
				},
				{
					q: "¿Por qué mi AVIF pesa más que el PNG?",
					a: "El AVIF sin pérdida o de calidad máxima, las imágenes muy pequeñas y los gráficos extremadamente sencillos pueden producir archivos mayores. Si el resultado no es más ligero, baja la calidad o conserva el PNG.",
				},
				{
					q: "¿Cualquier dispositivo puede mostrar AVIF?",
					a: "Todos los navegadores principales actuales sí, pero algunos editores, aplicaciones y sistemas antiguos no. Conserva el PNG original si la imagen debe abrirse en cualquier sitio.",
				},
			],
		},
		"pdf-to-png": {
			title: "Convertir PDF a PNG",
			intro: "Convierte páginas PDF en imágenes PNG localmente. Descarga una página directamente o varias en un ZIP numerado.",
			detail: "Las páginas se renderizan a 144 ppp. PNG evita añadir compresión de imagen con pérdida y es adecuado para texto, diagramas y capturas. Esta exportación no realiza OCR ni extrae texto editable.",
			tip: "Los límites actuales incluyen 200 páginas y 100 MiB de entrada; también se aplican límites de píxeles, salida y memoria. No se admiten PDF protegidos con contraseña. Prueba JPG o WebP si los PNG son demasiado grandes.",
			faqs: [
				{
					q: "¿Qué resolución tienen las páginas?",
					a: "Las páginas se renderizan a 144 ppp, suficiente para leer texto y diagramas con comodidad. Actualmente no hay ajuste para cambiar la resolución.",
				},
				{
					q: "¿Puedo extraer el texto del PDF?",
					a: "No. La herramienta genera imágenes de las páginas: el texto se convierte en píxeles y no se puede seleccionar ni buscar. No realiza OCR.",
				},
				{
					q: "¿Por qué se rechaza mi PDF?",
					a: "Las causas más habituales son documentos de más de 200 páginas, archivos de más de 100 MiB y PDF con contraseña. Unas dimensiones de página muy grandes también pueden agotar la memoria del navegador.",
				},
			],
		},
		"pdf-to-jpg": {
			title: "Convertir PDF a JPG",
			intro: "Convierte páginas PDF a JPG en tu navegador. Exporta una página o descarga un ZIP numerado para documentos de varias páginas.",
			detail: "La herramienta renderiza las páginas a 144 ppp y después las codifica como JPG. Es útil para páginas fotográficas, aunque la compresión puede afectar al texto pequeño. Ajusta la calidad antes de convertir.",
			tip: "JPG no conserva transparencia: las zonas transparentes se aplanan sobre blanco. Elige PNG para diagramas nítidos. No se admiten PDF protegidos con contraseña y se aplican límites de páginas, memoria y salida.",
			faqs: [
				{
					q: "¿Qué calidad elegir para las páginas JPG?",
					a: "La calidad equilibrada sirve para la mayoría de documentos. Si las páginas son sobre todo fotografías, merece la pena subir la calidad; para páginas de texto, PNG evita por completo los artefactos.",
				},
				{
					q: "¿Por qué el fondo sale blanco y no transparente?",
					a: "JPG no admite transparencia: las zonas transparentes se aplanan sobre blanco. Usa PNG si necesitas fondos transparentes.",
				},
				{
					q: "¿Puedo convertir solo algunas páginas?",
					a: "Sí. Tras el renderizado, descarga únicamente las páginas que necesites; el ZIP numerado es opcional. Los límites de 200 páginas y 100 MiB se aplican al documento completo.",
				},
			],
		},
		"image-compressor": {
			title: "Compresor de imágenes por lotes",
			intro: "Reduce el tamaño de imágenes localmente y compara el ahorro real. La salida inicial es WebP; puedes cambiar el formato y la calidad.",
			detail: "Añade imágenes JPG, PNG, WebP, AVIF o TIFF y ajusta la calidad a su uso. Las fotos, capturas e iconos se comprimen de manera diferente. Comprueba los detalles antes de reemplazar un original por un resultado más pequeño.",
			tip: "Volver a codificar no siempre ahorra espacio. Z8.Work muestra tanto reducciones como aumentos. Las cifras de carbono del almacenamiento son estimaciones condicionales, no mediciones de emisiones netas evitadas.",
			faqs: [
				{
					q: "¿Cuánto se reducirán mis imágenes?",
					a: "Depende del formato, las dimensiones y el contenido. Las fotos suelen reducirse más; las imágenes ya optimizadas o diminutas pueden no reducirse. El área de trabajo muestra los números reales por archivo en lugar de prometer un porcentaje.",
				},
				{
					q: "¿Qué formato de salida conviene?",
					a: "WebP es un buen valor predeterminado para la web, AVIF suele lograr los tamaños más pequeños y JPG es lo más seguro cuando prima la compatibilidad. Cambia el formato por archivo en el área de trabajo.",
				},
				{
					q: "¿La compresión es reversible?",
					a: "No. La recodificación con pérdida descarta datos de forma permanente. Conserva los originales; las copias comprimidas son para publicar y compartir.",
				},
			],
		},
		"webp-to-png": {
			title: "Convertir WebP a PNG",
			intro: "Convierte imágenes WebP a PNG localmente y por lotes. Ideal para editores y formularios que aún esperan PNG.",
			detail: "PNG se acepta en casi cualquier sitio donde se suben imágenes, mientras que algunos editores antiguos y validadores de formularios siguen rechazando WebP. La conversión decodifica el WebP y recodifica un PNG sin pérdida; la transparencia se conserva.",
			tip: "Los PNG suelen pesar más que los WebP originales: es lo esperado, no un error. Si el WebP se guardó con baja calidad, los artefactos seguirán visibles en el PNG; la conversión no puede deshacerlos.",
			faqs: [
				{
					q: "¿Convertir WebP a PNG pierde calidad?",
					a: "No se pierde calidad adicional. El WebP se decodifica a píxeles exactos y PNG los guarda sin pérdida. La suavidad o los artefactos que veas vienen de la codificación WebP original.",
				},
				{
					q: "¿Por qué mi archivo pesa más?",
					a: "La compresión sin pérdida de PNG es menos eficiente que la de WebP con pérdida, sobre todo en fotografías. El aumento de tamaño es normal al pasar a un formato sin pérdida.",
				},
				{
					q: "¿Se conserva la transparencia?",
					a: "Sí. Los canales alfa del WebP pasan intactos a PNG. Si convirtieras a JPG, la transparencia se aplanaría sobre blanco.",
				},
			],
		},
		"jpg-to-png": {
			title: "Convertir JPG a PNG",
			intro: "Convierte fotos JPG a PNG en tu navegador, por lotes y sin subidas.",
			detail: "PNG recodifica los píxeles decodificados del JPG sin añadir nuevos artefactos y admite transparencia, algo que JPG no tiene. Adecuado para imágenes destinadas a edición posterior, donde guardar repetidamente en JPG degradaría la calidad.",
			tip: "El PNG no se verá mejor que el JPG original: la conversión no puede revertir la compresión JPG. Espera archivos notablemente más grandes, sobre todo con fotografías.",
			faqs: [
				{
					q: "¿Convertir JPG a PNG mejora la calidad?",
					a: "No. Los píxeles son exactamente los que decodificó el JPG. PNG evita pérdidas en ediciones posteriores, pero no recupera el detalle que la codificación JPG ya descartó.",
				},
				{
					q: "¿Cuándo merece la pena pasar a PNG?",
					a: "Antes de editar imágenes que se guardarán repetidamente, cuando se necesita un fondo transparente, o cuando una aplicación o formulario solo acepta PNG.",
				},
				{
					q: "¿Por qué el PNG pesa mucho más que mi JPG?",
					a: "Las fotografías se comprimen mal en formatos sin pérdida. PNG guarda cada píxel exactamente, lo que cuesta espacio; JPG es pequeño precisamente porque descarta datos.",
				},
			],
		},
		"png-to-jpg": {
			title: "Convertir PNG a JPG",
			intro: "Convierte imágenes PNG a JPG localmente. Reduce capturas y exportaciones para correo, formularios y almacenamiento.",
			detail: "La compresión con pérdida de JPG suele recortar drásticamente el tamaño de los PNG, algo útil para subidas con límite y para almacenar fotos. A cambio se pierde la transparencia —las zonas transparentes se aplanan sobre blanco— y hay una pérdida de calidad controlada con el ajuste de calidad.",
			tip: "Conserva PNG para arte lineal, capturas con texto pequeño o imágenes con transparencia: JPG puede difuminar los bordes nítidos y crear halo alrededor del texto. El área de trabajo informa del cambio de tamaño real por archivo.",
			faqs: [
				{
					q: "¿Dónde quedó mi fondo transparente?",
					a: "JPG no tiene canal alfa, así que las zonas transparentes se aplanan sobre blanco. Usa WebP si necesitas archivos menores que conserven la transparencia.",
				},
				{
					q: "¿Qué calidad debo usar?",
					a: "Entre 80 y 90 sirve para la mayoría de capturas y gráficos. Valores menores reducen más el tamaño pero difuminan bordes; revisa el texto pequeño y los bordes antes de decidir.",
				},
				{
					q: "¿Por qué el texto de mi JPG se ve borroso?",
					a: "La compresión JPG está pensada para fotografías. Los bordes duros, como el texto y los elementos de interfaz, muestran artefactos visibles. Para capturas, PNG sigue siendo mejor.",
				},
			],
		},
		"webp-to-jpg": {
			title: "Convertir WebP a JPG",
			intro: "Convierte imágenes WebP a JPG en tu navegador para aplicaciones y servicios que solo aceptan JPG.",
			detail: "Algunos formularios, editores y aplicaciones antiguas siguen rechazando WebP. Convertir a JPG produce un archivo legible en todas partes; como JPG tiene pérdida, elige una calidad adecuada al uso previsto de la imagen.",
			tip: "Se pierde la transparencia: los canales alfa del WebP se aplanan sobre blanco. Para imágenes que deban seguir siendo transparentes o píxel-exactas, conviértelas a PNG. El área de trabajo muestra el cambio de tamaño de cada resultado.",
			faqs: [
				{
					q: "¿Por qué algunos servicios siguen rechazando WebP?",
					a: "WebP es décadas más reciente que JPG, y gestores de contenido, editores y validadores antiguos nunca llegaron a admitirlo. Convertir a JPG es la solución práctica.",
				},
				{
					q: "¿Esta conversión tiene pérdida?",
					a: "Sí. JPG recodifica la imagen y los artefactos del WebP original permanecen. Una calidad más alta reduce la pérdida adicional a cambio de archivos mayores.",
				},
				{
					q: "¿Qué formato conviene conservar como original?",
					a: "El WebP, si el almacenamiento lo permite: pesa menos y conserva la transparencia. Haz copias JPG para los servicios que las exijan.",
				},
			],
		},
		"heic-to-png": {
			title: "Convertir HEIC a PNG",
			intro: "Convierte fotos HEIC y HEIF a PNG en tu navegador, de una en una o por lotes. Sin subidas.",
			detail: "PNG conviene a fotos destinadas a edición, superposiciones o formularios que rechazan HEIC: píxel-exacto, sin pérdida y ampliamente aceptado, a tamaños mayores que JPG. La foto original del iPhone permanece intacta y cada resultado informa de su cambio de tamaño.",
			tip: "Las fotos PNG son mucho más grandes que los originales HEIC; elige JPG cuando el tamaño importe más que el almacenamiento sin pérdida. Algunas variantes HEIC pueden no decodificarse: reexporta desde el dispositivo de origen si ocurre.",
			faqs: [
				{
					q: "¿Convierto HEIC a PNG o a JPG?",
					a: "PNG si vas a editar la foto o quieres almacenamiento sin pérdida; JPG si necesitas un archivo menor para compartir y formularios. Este sitio ofrece ambos: consulta la página de HEIC a JPG.",
				},
				{
					q: "¿Se convierten las fotos en vivo (Live Photos)?",
					a: "La imagen fija se convierte con normalidad. El vídeo breve adjunto a una foto en vivo es un archivo aparte y no se incluye en el PNG.",
				},
				{
					q: "¿Por qué mi PNG pesa mucho más que el HEIC?",
					a: "HEIC es de los formatos fotográficos más eficientes que existen, mientras que PNG guarda los píxeles sin pérdida. Un archivo mayor es el coste esperado de una salida sin pérdida.",
				},
			],
		},
		"svg-to-png": {
			title: "Convertir SVG a PNG",
			intro: "Rasteriza gráficos SVG a PNG localmente. Genera exportaciones de mapa de bits con tamaño fijo donde se exijan.",
			detail: "SVG escala a cualquier tamaño, pero las tiendas de aplicaciones, los mercados y los formularios suelen exigir PNG con dimensiones concretas en píxeles. Esta conversión renderiza tu archivo vectorial a PNG en el navegador; el SVG original no se modifica.",
			tip: "Las funciones SVG complejas —fuentes web, filtros, referencias externas— pueden renderizarse de forma distinta o no renderizarse. Comprueba el resultado a su tamaño final y reexporta desde tu herramienta de diseño si algo falla.",
			faqs: [
				{
					q: "¿Qué tamaño tendrá el PNG?",
					a: "Los atributos width y height en números simples del SVG se convierten en el tamaño del PNG. Cuando faltan o usan unidades y porcentajes, se aplican las proporciones del viewBox; si nada es utilizable, la salida es un lienzo de 512×512. Para dimensiones exactas, define width y height sencillos en el SVG o exporta desde tu herramienta de diseño.",
				},
				{
					q: "¿Por qué se ven mal las fuentes de mi SVG?",
					a: "El texto SVG depende de las fuentes disponibles en el dispositivo que lo muestra. El texto convertido a trazados se renderiza de forma fiable; las referencias a fuentes concretas pueden sustituirse. Convierte el texto a trazados en tu editor para evitarlo.",
				},
				{
					q: "¿El resultado sigue siendo escalable?",
					a: "No. PNG es un mapa de bits de resolución fija. Conserva el SVG como archivo maestro y vuelve a rasterizar cuando necesites otro tamaño.",
				},
			],
		},
		"wav-to-mp3": {
			title: "Convertir WAV a MP3",
			intro: "Convierte audio WAV a MP3 en tu navegador. Procesa grabaciones y música por lotes sin subirlas.",
			detail: "WAV almacena audio PCM sin comprimir, así que los archivos son enormes; MP3 los reduce a una fracción de su tamaño con una reproducción que funciona prácticamente en todas partes. Usa una tasa de bits menor para locuciones y mayor para música, y compara los resultados en el área de trabajo.",
			tip: "MP3 tiene pérdida, así que la conversión no puede deshacerse; conserva el WAV original como copia de archivo. Las disposiciones WAV fuera del PCM estándar pueden no decodificarse.",
			faqs: [
				{
					q: "¿Qué tasa de bits elijo para el MP3?",
					a: "192 kbps sirven para la mayoría de música y 128 kbps bastan para voz. Más tasa de bits conserva más detalle a costa de archivos mayores; el área de trabajo muestra el tamaño de cada resultado para que compares.",
				},
				{
					q: "¿El MP3 sonará igual que el WAV?",
					a: "MP3 descarta datos de audio por diseño. Con tasas de bits altas y equipo corriente, casi nadie nota la diferencia; para archivo y producción, mantén un formato sin pérdida.",
				},
				{
					q: "¿Por qué mi WAV pesa tanto?",
					a: "WAV guarda cada muestra sin comprimir, unos 10 MB por minuto en estéreo con calidad CD. Es ideal para grabar y editar, y poco práctico para compartir, que es justo el terreno del MP3.",
				},
			],
		},
		"mp3-to-wav": {
			title: "Convertir MP3 a WAV",
			intro: "Pasa tus MP3 a audio WAV localmente. Útil para editores y equipos que esperan entrada sin comprimir.",
			detail: "Convertir a WAV no recupera los datos que la compresión MP3 eliminó; reenvasa el audio decodificado en un contenedor sin comprimir. WAV encaja en cadenas de edición y hardware que rechaza formatos con pérdida, no en ahorrar espacio: los archivos crecen mucho.",
			tip: "La salida WAV ronda los 10 MB por minuto de audio estéreo. Volver a convertir un archivo con pérdida a WAV no mejorará su calidad; parte de fuentes sin pérdida si necesitas audio impoluto.",
			faqs: [
				{
					q: "¿Convertir MP3 a WAV mejora el sonido?",
					a: "No. La conversión decodifica los datos MP3 existentes y a partir de ahí los guarda sin pérdida, pero la calidad ya perdida en la codificación MP3 no se recupera.",
				},
				{
					q: "¿Por qué el WAV pesa tanto más?",
					a: "WAV guarda cada muestra sin comprimir, unos 10 MB por minuto en estéreo con calidad CD, mientras que MP3 comprime descartando datos que se consideran menos audibles.",
				},
				{
					q: "¿Puedo editar el WAV resultante?",
					a: "Sí. WAV es el formato estándar de intercambio para editores y DAW, y cada guardado posterior es sin pérdida, así que no se pierde más calidad mientras trabajas.",
				},
			],
		},
		"m4a-to-mp3": {
			title: "Convertir M4A a MP3",
			intro: "Convierte audio M4A a MP3 en tu navegador, por lotes y sin subir archivos.",
			detail: "Los archivos M4A suelen contener audio AAC; algunos contienen Apple Lossless (ALAC). Ambos se convierten a MP3 aquí. MP3 sigue siendo la opción más segura para autoradios, reproductores MP3 y software antiguo que no reconoce AAC.",
			tip: "Las compras protegidas con DRM no se pueden convertir. Pasar de AAC o ALAC a MP3 tiene pérdida, así que conserva el archivo original para el futuro.",
			faqs: [
				{
					q: "¿Se pueden convertir archivos M4A protegidos?",
					a: "No. Los archivos con DRM fallan. La música comprada en iTunes Store antes de 2009 y las descargas de suscripción suelen estar protegidas; los archivos ripiados o sin DRM se convierten con normalidad.",
				},
				{
					q: "¿Convertir M4A a MP3 pierde calidad?",
					a: "Ligeramente, y de forma irreversible: MP3 recodifica un audio que AAC ya comprimió. Con tasas de bits altas la diferencia casi no se oye. Las fuentes ALAC conservan todo el detalle hasta el paso de codificación MP3.",
				},
				{
					q: "¿Qué formato tiene más compatibilidad, M4A o MP3?",
					a: "MP3. Todos los teléfonos y ordenadores modernos reproducen AAC/M4A, pero las autoradios, los reproductores antiguos y algunas aplicaciones siguen esperando MP3 en primer lugar.",
				},
			],
		},
		"mp3-to-m4a": {
			title: "Convertir MP3 a M4A",
			intro: "Reenvasa audio MP3 como M4A en tu navegador. Útil para ecosistemas Apple y aplicaciones que prefieren AAC.",
			detail: "Esta conversión decodifica el MP3 y lo recodifica como M4A. El resultado no recupera la calidad perdida en la codificación MP3, pero AAC suele alcanzar una audibilidad similar en tamaños menores, lo que ayuda cuando la biblioteca debe ser compacta.",
			tip: "Si la fuente existe como rip de CD o archivo sin pérdida, convierte esa fuente directamente a M4A y evitas una segunda pasada con pérdida. Conserva los originales si el almacenamiento lo permite.",
			faqs: [
				{
					q: "¿M4A es mejor que MP3?",
					a: "A igual tasa de bits, AAC suele sonar ligeramente mejor y es el formato predeterminado en plataformas Apple. MP3 sigue siendo más universal en hardware antiguo; la mejor elección depende de dónde reproduces tus archivos.",
				},
				{
					q: "¿Por qué la conversión no mejora el sonido?",
					a: "Decodificar el MP3 produce exactamente el audio que almacenaba, ni un bit más. Recodificar no puede devolver el detalle que el codificador MP3 descartó.",
				},
				{
					q: "¿Sobreviven las etiquetas de artista y carátula?",
					a: "Parte de los metadatos puede no trasladarse entre contenedores. Convierte un archivo y revisa sus etiquetas en tu reproductor antes de convertir una biblioteca entera.",
				},
			],
		},
		"flac-to-mp3": {
			title: "Convertir FLAC a MP3",
			intro: "Convierte música FLAC sin pérdida a MP3 localmente. Conserva el archivo, crea la copia portátil.",
			detail: "FLAC preserva cada muestra de la grabación original; MP3 hace la música portátil a una fracción del tamaño. El patrón habitual: FLAC como biblioteca permanente y copias MP3 para móviles, autoradios y reproductores con poco espacio.",
			tip: "Convertir FLAC a MP3 descarta datos de audio de forma permanente. Conserva el FLAC original: volver a convertir el MP3 a FLAC más tarde no recuperará el detalle perdido.",
			faqs: [
				{
					q: "¿Qué tasa de bits conviene para música convertida de FLAC?",
					a: "Entre 256 y 320 kbps es lo habitual. Las diferencias con el sin pérdida son sutiles en equipo de escucha normal; para escuchar de fondo, tasas menores van bien.",
				},
				{
					q: "¿Para qué conservar los FLAC?",
					a: "Las bibliotecas sobreviven a los dispositivos. Los másteres sin pérdida permiten recodificar a cualquier formato futuro o corregir etiquetas sin pérdida de calidad, mientras que cada conversión entre formatos con pérdida acumula daño.",
				},
				{
					q: "¿Sobreviven las etiquetas y las carátulas?",
					a: "Parte de los metadatos puede perderse al recodificar. Prueba con un álbum, revisa sus etiquetas en el reproductor y convierte el resto de la biblioteca después.",
				},
			],
		},
		"opus-to-mp3": {
			title: "Convertir Opus a MP3",
			intro: "Convierte audio Opus a MP3 en tu navegador para reproductores y aplicaciones que no admiten Opus.",
			detail: "Opus es eficiente en streaming, llamadas y voz, pero el soporte de hardware y aplicaciones aún va por detrás de MP3. Esta conversión decodifica el Opus y recodifica a MP3; los resultados suelen ser más grandes, porque MP3 necesita más bits para la misma audibilidad.",
			tip: "Opus tiene pérdida, así que convertir a MP3 apila una codificación con pérdida sobre otra. Si la grabación también existe como original sin pérdida, convierte desde ese.",
			faqs: [
				{
					q: "¿Por qué mi MP3 pesa más que el Opus original?",
					a: "Opus comprime mejor que MP3, sobre todo a tasas de bits bajas. Igualar la misma audibilidad en MP3 exige más bits, así que el archivo crece aunque la calidad no mejore.",
				},
				{
					q: "¿Las grabaciones de voz se convierten bien?",
					a: "Sí. La voz tolera la compresión mucho mejor que la música: notas de voz y grabaciones de llamadas sobreviven a la conversión Opus-MP3 sin problemas audibles con tasas de bits moderadas.",
				},
				{
					q: "¿Qué aplicaciones aún piden MP3 en lugar de Opus?",
					a: "Autorradios, reproductores MP3 antiguos, algunas aplicaciones de pódcast y varios formularios web siguen rechazando Opus. MP3 sigue siendo el comodín de compatibilidad.",
				},
			],
		},
		"aiff-to-mp3": {
			title: "Convertir AIFF a MP3",
			intro: "Convierte grabaciones AIFF a MP3 en tu navegador. Habitual en audio exportado de macOS y herramientas de estudio.",
			detail: "AIFF es el contenedor de audio sin comprimir de Apple, equivalente en tamaño a WAV. La salida MP3 hace que esas grabaciones sean prácticas de compartir y almacenar, con una tasa de bits ajustable por lote: la voz y la música tienen necesidades distintas.",
			tip: "Se aceptan archivos AIFF, AIFC y .aif. MP3 tiene pérdida; archiva el AIFF original siempre que la grabación importe.",
			faqs: [
				{
					q: "¿AIFF es lo mismo que WAV?",
					a: "Prácticamente: ambos guardan audio PCM sin comprimir con los mismos tamaños. AIFF es la opción tradicional en macOS y WAV en el resto. Para convertir a MP3 se comportan igual.",
				},
				{
					q: "¿Puedo convertir varios AIFF a la vez?",
					a: "Sí. Añade el lote completo: cada archivo se convierte con los ajustes mostrados y puedes descargarlos uno a uno o juntos. Nada sale de tu dispositivo.",
				},
				{
					q: "¿Qué tasa de bits para notas de voz y entrevistas?",
					a: "96–128 kbps bastan para la voz. La música necesita más; 192 kbps o superior es un rango más seguro para contenido mixto.",
				},
			],
		},
		"wma-to-mp3": {
			title: "Convertir WMA a MP3",
			intro: "Convierte archivos Windows Media Audio a MP3 localmente, sin instalar software de medios.",
			detail: "Los archivos WMA suelen venir de herramientas Windows antiguas, grabadoras de voz y tiendas de descargas. MP3 se reproduce casi en cualquier parte, así que convertir una biblioteca WMA antigua la hace portátil de nuevo, procesada por completo en tu equipo.",
			tip: "Algunos archivos WMA están protegidos con DRM y no se pueden convertir. WMA tiene pérdida, así que el MP3 hereda su techo de calidad; conserva los originales donde aún los tengas.",
			faqs: [
				{
					q: "¿Por qué no se convierte mi WMA?",
					a: "La causa más habitual es la protección DRM de archivos de tiendas de descargas antiguas. Algunas variantes raras del códec WMA también pueden fallar al decodificar; esas necesitan el software Windows original.",
				},
				{
					q: "¿WMA tiene peor calidad que MP3?",
					a: "A tasas de bits bajas, WMA era competitivo con MP3. En cualquier caso, recodificar no mejora la calidad: solo cambia qué dispositivos pueden reproducir el archivo.",
				},
				{
					q: "¿Puedo convertir una biblioteca WMA completa por lotes?",
					a: "Sí. Añade los archivos de la carpeta a la cola y conviértelos de una vez, descargándolos individualmente o como ZIP. Los archivos protegidos se informan como fallos, no se saltan en silencio.",
				},
			],
		},
		"mp4-to-mp3": {
			title: "Convertir MP4 a MP3",
			intro: "Extrae la pista de audio de vídeo MP4 como MP3, por completo en tu navegador. El vídeo nunca sale de tu dispositivo.",
			detail: "Esta conversión conserva el sonido y descarta la imagen: el flujo de audio se decodifica y codifica como MP3. Útil para clases, entrevistas, pódcast y vídeos musicales donde solo importa la escucha.",
			tip: "Los vídeos grandes están limitados por la memoria del navegador, no por una cuota fija: los archivos muy largos pueden fallar en equipos con poca RAM. El vídeo original no se modifica y no se sube nada.",
			faqs: [
				{
					q: "¿Convertir elimina el vídeo de mi archivo?",
					a: "No. Tu MP4 original queda exactamente igual; obtienes un nuevo archivo MP3 aparte.",
				},
				{
					q: "¿Hasta qué tamaño de vídeo puedo convertir?",
					a: "El techo lo marca la memoria del navegador: el búfer se agota justo por debajo de 2 GiB. Los vídeos habituales van bien; grabaciones de varias horas en equipos con poca RAM pueden no llegar.",
				},
				{
					q: "¿Qué tasa de bits elijo?",
					a: "128 kbps para contenido hablado; 192–320 kbps para vídeos musicales. Más tasa de bits suena mejor y produce archivos proporcionalmente mayores.",
				},
			],
		},
		"webm-to-mp3": {
			title: "Convertir WebM a MP3",
			intro: "Saca el audio de los vídeos WebM como MP3, localmente en tu navegador.",
			detail: "Los archivos WebM suelen llevar audio Opus o Vorbis. Ambos se decodifican aquí y se recodifican a MP3, el formato de audio con mayor aceptación en editores, reproductores y formularios de subida.",
			tip: "Las grabaciones de pantalla y los clips descargados a veces contienen pistas de audio silenciosas o multicanal: comprueba un resultado antes de convertir por lotes. Los archivos se procesan solo en tu dispositivo.",
			faqs: [
				{
					q: "¿Por qué el MP3 pesa más que el WebM?",
					a: "Los códecs de audio de WebM (Opus, Vorbis) son más eficientes que MP3. Recodificar a MP3 cambia compatibilidad por tamaño, así que la pista de audio crece.",
				},
				{
					q: "¿Puedo convertir un WebM sin pista de audio?",
					a: "No. Los archivos sin flujo de audio fallan con un error claro: una grabación de pantalla silenciosa no tiene nada que extraer.",
				},
				{
					q: "¿Influye la resolución del vídeo?",
					a: "No. Solo se decodifica el flujo de audio; un WebM 4K y otro 240p con el mismo sonido producen el mismo resultado.",
				},
			],
		},
		"mov-to-mp3": {
			title: "Convertir MOV a MP3",
			intro: "Convierte vídeos MOV de iPhone y cámaras a audio MP3 sin subir las grabaciones.",
			detail: "MOV es el contenedor que usan los iPhone, muchas cámaras y las grabaciones de pantalla, y normalmente lleva audio AAC. Esta página decodifica esa pista y codifica MP3: práctico para notas de voz, clases y clips que quieres escuchar en vez de ver.",
			tip: "Los vídeos HEVC, habituales en los iPhone recientes, funcionan bien: solo se lee la pista de audio. Las grabaciones muy grandes dependen de la memoria disponible en el navegador. El vídeo original nunca se modifica.",
			faqs: [
				{
					q: "¿Funcionan los vídeos de iPhone?",
					a: "Sí. Las grabaciones MOV de iOS y macOS, incluidas las variantes HEVC, admiten la extracción de audio. El vídeo permanece en tu dispositivo durante todo el proceso.",
				},
				{
					q: "¿Puedo extraer el audio de varios vídeos a la vez?",
					a: "Sí. Añade todos los archivos a la cola; se convierten con los mismos ajustes y puedes descargarlos uno a uno o juntos.",
				},
				{
					q: "¿Cambiará mi MOV original?",
					a: "Nunca. El resultado es un nuevo archivo MP3; el vídeo original permanece intacto donde está.",
				},
			],
		},
		"docx-to-md": {
			title: "Convertir DOCX a Markdown",
			intro: "Convierte documentos Word a Markdown localmente. Obtén texto limpio para sitios de documentación, README y repositorios Git.",
			detail: "La conversión ejecuta un motor de documentos en tu navegador: encabezados, listas, tablas y enlaces se asignan a la sintaxis Markdown. Los mejores resultados llegan con documentos de estructura sencilla; el diseño complejo, los cuadros de texto y los cambios registrados no se traducen.",
			tip: "Revisa el Markdown tras convertir: las funciones complejas de Word pueden descartarse o aplanarse en lugar de corromperse en silencio. El DOCX original nunca sale de tu dispositivo.",
			faqs: [
				{
					q: "¿Qué pasa con las imágenes del documento?",
					a: "El foco es la estructura del texto: pueden aparecer referencias a imágenes en el Markdown, pero los archivos de imagen no se exportan. Vuelve a añadir las imágenes desde el documento original si las necesitas.",
				},
				{
					q: "¿Qué formato se conserva?",
					a: "Encabezados, negrita y cursiva, listas, tablas, enlaces y citas se convierten de forma fiable. Columnas, cuadros de texto, encabezados y pies, y cambios registrados no: se omiten en lugar de quedar corruptos.",
				},
				{
					q: "¿Mi documento se sube a algún sitio?",
					a: "No. El motor de conversión funciona en tu navegador con WebAssembly. El documento se lee del disco y se procesa en memoria en tu máquina.",
				},
			],
		},
		"md-to-docx": {
			title: "Convertir Markdown a DOCX",
			intro: "Convierte archivos Markdown a documentos Word localmente. Entrega documentación a quien vive en Word.",
			detail: "Encabezados, énfasis, listas, bloques de código y enlaces se convierten en estructura de Word correcta. El resultado se abre en Word, LibreOffice y Google Docs. El procesado ocurre por completo en tu navegador; el Markdown no se sube.",
			tip: "Markdown no tiene concepto de maquetación de página: márgenes, fuentes y saltos usan los valores de Word y pueden ajustarse tras abrir el documento. Documentos muy largos pueden tardar un poco en equipos con poca memoria.",
			faqs: [
				{
					q: "¿Qué funciones de Markdown se admiten?",
					a: "El conjunto estándar: encabezados ATX, listas ordenadas y sin orden, tablas de barras, bloques de código delimitados, enlaces, énfasis y citas. El HTML incrustado en el Markdown suele descartarse.",
				},
				{
					q: "¿Puedo controlar el estilo de Word?",
					a: "El conversor aplica su propio estilo predeterminado. Abre el DOCX en Word y aplica después tu plantilla o tema corporativo.",
				},
				{
					q: "¿Las tablas y los bloques de código quedan bien?",
					a: "Las tablas de barras se convierten en tablas de Word y el código delimitado en bloques monoespaciados. El contenido anidado complejo puede requerir un retoque tras la conversión.",
				},
			],
		},
		"epub-to-docx": {
			title: "Convertir EPUB a DOCX",
			intro: "Convierte libros electrónicos EPUB a documentos Word en tu navegador, sin subir el libro.",
			detail: "Útil cuando necesitas anotar un libro electrónico en Word, extraer capítulos para editar o entregar un manuscrito a alguien que trabaja con software de ofimática. La estructura de capítulos y el formato básico se conservan; las compras de tienda con DRM no se convierten.",
			tip: "La tipografía del libro electrónico —fuentes, capitulares, diseños fijos— no coincidirá con el original; el objetivo es texto editable, no una copia visual. Revisa los cortes de capítulo y la posición de las imágenes tras convertir.",
			faqs: [
				{
					q: "¿Puedo convertir libros comprados?",
					a: "Solo EPUB sin DRM. Las compras de tienda protegidas con DRM fallan por diseño; esta herramienta procesa archivos que posees legítimamente y sin restricciones.",
				},
				{
					q: "¿Sobreviven las imágenes?",
					a: "Algunas imágenes se conservan, aunque su posición puede desplazarse en Word. Compara la salida con el original por lo que respecta a figuras y cubierta.",
				},
				{
					q: "¿Mi libro se sube a algún sitio?",
					a: "No. El motor de documentos funciona en tu navegador; la lectura y conversión del EPUB ocurren por completo en tu dispositivo.",
				},
			],
		},
		"png-converter": {
			title: "Convertidor de PNG",
			intro: "Convierte imágenes PNG a otros formatos y desde otros formatos en tu navegador. Todas las herramientas de esta página procesan los archivos localmente.",
			detail: "PNG es la opción segura y sin pérdida para capturas, arte lineal e imágenes con transparencia. Elige una conversión para preseleccionar sus formatos: a WebP o AVIF cuando importe el rendimiento web, a JPG cuando el formulario solo acepta fotos, o hacia PNG desde WebP, JPG, HEIC, SVG o páginas PDF.",
			tip: "Los PNG sin pérdida suelen pesar más que las salidas con pérdida. Si el PNG convertido debe seguir siendo pequeño, pásalo por el compresor de imágenes o elige JPG/WebP.",
			faqs: [
				{
					q: "¿PNG es un formato sin pérdida?",
					a: "Sí. PNG guarda cada píxel exactamente, por eso se prefiere para capturas, diagramas y cualquier imagen que no deba degradarse, y por eso sus archivos pesan más que los formatos con pérdida.",
				},
				{
					q: "¿Cuándo no conviene usar PNG?",
					a: "Para fotografías destinadas a compartir o a la web, JPG o WebP dan archivos mucho más pequeños sin diferencia visible. PNG brilla en bordes nítidos, texto y transparencia.",
				},
				{
					q: "¿De verdad son gratuitas estas conversiones?",
					a: "Sí. Todas las herramientas enlazadas aquí son gratuitas, no requieren cuenta y procesan los archivos en tu navegador, no en un servidor.",
				},
			],
		},
		"jpg-converter": {
			title: "Convertidor de JPG",
			intro: "Convierte imágenes a JPG y desde JPG en tu navegador. Por lotes, sin subidas y sin cuentas.",
			detail: "JPG es el formato fotográfico universal, aceptado por prácticamente todos los formularios, editores y dispositivos. Convierte a JPG desde HEIC, PNG o WebP por compatibilidad, o de JPG a PNG para editar sin pérdida, teniendo en cuenta que el PNG no puede devolver una transparencia que el JPG nunca guardó.",
			tip: "JPG descarta datos de imagen en cada codificación; volver a guardar un JPG repetidamente lo degrada. Trabaja desde los originales cuando la calidad importe.",
			faqs: [
				{
					q: "JPG o JPEG, ¿hay diferencia?",
					a: "Ninguna. Son el mismo formato: JPEG es el nombre original y JPG la abreviatura de tres letras que se conservó para Windows antiguo. Ambos archivos se convierten igual aquí.",
				},
				{
					q: "¿Convertir a JPG pierde calidad?",
					a: "Sí, algo: JPG tiene pérdida. El ajuste de calidad controla el equilibrio; con valores equilibrados la diferencia casi no se ve, y el área de trabajo informa del cambio de tamaño de cada archivo.",
				},
				{
					q: "¿Puede JPG almacenar transparencia?",
					a: "No. Las zonas transparentes se aplanan sobre blanco al convertir a JPG. Usa PNG o WebP para imágenes con fondos transparentes.",
				},
			],
		},
		"webp-converter": {
			title: "Convertidor de WebP",
			intro: "Convierte imágenes PNG o JPG a WebP, y WebP de vuelta a PNG o JPG, localmente en tu navegador.",
			detail: "WebP es un formato de imagen moderno: menor que JPG y PNG con calidad similar y con soporte de transparencia. Convierte a WebP para adelgazar sitios y almacenamiento; convierte desde WebP para editores y formularios que aún lo rechazan.",
			tip: "Convertir WebP a PNG o JPG no recupera la calidad que la codificación WebP ya descartó, y la salida JPG pierde la transparencia. Conserva los másteres WebP si el almacenamiento lo permite.",
			faqs: [
				{
					q: "¿WebP de verdad pesa menos que JPG?",
					a: "Normalmente sí, entre un 25 y un 35 % menos con calidad comparable. Las imágenes muy pequeñas o ya optimizadas pueden ser la excepción: compara los tamaños informados en lugar de darlo por hecho.",
				},
				{
					q: "¿Todos los navegadores admiten WebP?",
					a: "Todos los navegadores principales actuales sí. Algunas aplicaciones de escritorio antiguas, gestores de contenido y formularios no: ese es el caso en el que convertir WebP a PNG o JPG ayuda.",
				},
				{
					q: "¿WebP puede ser sin pérdida?",
					a: "Sí. WebP tiene modo sin pérdida; elige el ajuste de calidad sin pérdida en el área de trabajo cuando los píxeles deban ser exactos, a costa de archivos mayores.",
				},
			],
		},
		"mp3-converter": {
			title: "Convertidor de MP3",
			intro: "Convertidor de MP3 gratuito: pasa audio y vídeo a MP3, o MP3 a otros formatos, dentro de tu navegador y sin subidas.",
			detail: "MP3 sigue siendo el campeón de la compatibilidad: autorradios, reproductores, editores y formularios lo aceptan. Convierte audio WAV, FLAC, M4A, Opus, AIFF o WMA a MP3, extrae audio MP3 de vídeo MP4, WebM o MOV, o pasa MP3 a WAV para editar.",
			tip: "MP3 tiene pérdida: convertir otros formatos con pérdida a MP3 apila compresiones. Usa la tasa de bits más alta razonable y conserva originales sin pérdida para conversiones futuras.",
			faqs: [
				{
					q: "¿Sigue mereciendo la pena MP3?",
					a: "Por compatibilidad, sí: nada más se reproduce en todas partes. AAC y Opus son más eficientes a igual calidad; úsalos cuando tú controlas el entorno de reproducción.",
				},
				{
					q: "¿Qué tasa de bits elijo?",
					a: "128 kbps para voz, 192 kbps o más para música y 320 kbps para copias portátiles con ánimo de archivo. El área de trabajo muestra los tamaños para sopesar calidad y espacio.",
				},
				{
					q: "¿Puedo extraer audio MP3 de un vídeo?",
					a: "Sí. Hay páginas específicas para MP4, WebM y MOV a MP3; solo se decodifica el flujo de audio y el archivo de vídeo no se modifica.",
				},
			],
		},
		"docx-converter": {
			title: "Convertidor de DOCX",
			intro: "Convierte documentos Word a otros formatos y desde otros formatos localmente. Tus archivos se quedan en el navegador.",
			detail: "DOCX es el estándar ofimático, pero encaja mal con los flujos de texto plano. Convierte DOCX a Markdown para documentación y Git, o genera DOCX desde Markdown y EPUB cuando se exija el formato Word. Los documentos de estructura sencilla se mapean mejor.",
			tip: "Funciones de Word como cambios registrados, cuadros de texto y columnas no sobreviven a la conversión en ningún sentido. Convierte una muestra primero si el formato importa.",
			faqs: [
				{
					q: "¿Puedo convertir DOCX a PDF aquí?",
					a: "Todavía no: la generación de PDF en el navegador no forma parte aún de los conversores de este sitio. Las herramientas enlazadas aquí se centran en Markdown, EPUB y flujos de texto editable.",
				},
				{
					q: "¿Sobreviven los comentarios y los cambios registrados?",
					a: "No. Las conversiones leen el contenido del documento; el material de revisión se omite. Acepta o rechaza los cambios en Word antes de convertir si afectan al texto.",
				},
				{
					q: "¿Las conversiones de documentos son privadas?",
					a: "Sí. El motor de conversión funciona en tu navegador con WebAssembly; los documentos se procesan en la memoria de tu dispositivo y nunca se suben.",
				},
			],
		},
		"m4a-to-wav": {
			title: "Convertir M4A a WAV",
			intro: "Convierte audio M4A a WAV localmente, para editores y flujos que necesitan entrada sin comprimir.",
			detail: "El audio AAC dentro del M4A se decodifica y se guarda como WAV sin comprimir. Útil antes de editar audio o en flujos que rechazan archivos con pérdida, con la salvedad de que decodificar no recupera el detalle que la codificación AAC ya eliminó.",
			tip: "Los WAV rondan los 10 MB por minuto de estéreo. Para escuchar y compartir, conservar el M4A o pasarlo a MP3 suele ser el mejor trato.",
			faqs: [
				{
					q: "¿Para qué convertir M4A a WAV?",
					a: "Las cadenas de edición y parte del hardware quieren archivos sin comprimir. Desde la conversión en adelante, el WAV conserva cada muestra decodificada sin pérdida: editar ya no cuesta calidad.",
				},
				{
					q: "¿Sonará mejor el WAV que el M4A?",
					a: "No. Es el mismo audio decodificado en un contenedor más grande. WAV evita pérdidas futuras al editar; no mejora nada.",
				},
				{
					q: "¿ALAC cambia algo?",
					a: "Sí, para bien. Los M4A basados en ALAC son sin pérdida, así que su WAV conserva la calidad completa de la fuente y no una versión comprimida con AAC.",
				},
			],
		},
		"wav-to-flac": {
			title: "Convertir WAV a FLAC",
			intro: "Comprime audio WAV a FLAC localmente: la mitad de tamaño, sin pérdida y con calidad intacta.",
			detail: "FLAC comprime WAV con exactitud: cada muestra sobrevive a la decodificación, normalmente a la mitad del tamaño. El paso natural para grabaciones archivadas que siguen guardadas como WAV enormes.",
			tip: "FLAC se reproduce en ordenadores, móviles y reproductores modernos; unos pocos reproductores hardware exóticos siguen pidiendo WAV. Guarda una copia WAV solo para esos equipos concretos.",
			faqs: [
				{
					q: "¿FLAC es de verdad sin pérdida?",
					a: "Sí. Un FLAC decodificado es idéntico bit a bit al WAV de origen; las sumas de comprobación coinciden. Por eso es el formato estándar de archivo para audio.",
				},
				{
					q: "¿Cuánto se reducen los archivos?",
					a: "Normalmente al 40–60 % del tamaño del WAV, según la complejidad del contenido. El área de trabajo muestra el tamaño real de cada resultado.",
				},
				{
					q: "¿Puedo volver a WAV más adelante?",
					a: "Sí, y de forma exacta. FLAC a WAV restaura las muestras idénticas: una reversibilidad que los formatos con pérdida no ofrecen.",
				},
			],
		},
		"mp3-to-flac": {
			title: "Convertir MP3 a FLAC",
			intro: "Envuelve audio MP3 en un contenedor FLAC sin pérdida localmente, y entiende qué hace y qué no.",
			detail: "Convertir MP3 a FLAC produce un archivo mayor que conserva el MP3 decodificado exactamente, pero no recupera la calidad que la codificación MP3 descartó. Tiene sentido para software y flujos que exigen archivos sin pérdida, no para la calidad.",
			tip: "Si existe un original sin pérdida, conviértelo desde esa fuente: un FLAC derivado de MP3 nunca superará a su MP3. El archivo crece hasta un tamaño cercano al WAV.",
			faqs: [
				{
					q: "¿Convertir MP3 a FLAC mejora la calidad?",
					a: "No. El audio es idéntico al que contiene el MP3. La ausencia de pérdida de FLAC rige desde la conversión en adelante; no revierte la codificación con pérdida anterior.",
				},
				{
					q: "¿Entonces para qué MP3 a FLAC?",
					a: "Algunos editores, normas de archivo y flujos de subida solo aceptan archivos sin pérdida. FLAC los satisface manteniendo el audio bit a bit idéntico a partir de ahora.",
				},
				{
					q: "¿Por qué pesa tanto el FLAC?",
					a: "FLAC guarda las muestras decodificadas completas: un tamaño de MP3 solo es posible descartando audio, y FLAC se niega a hacerlo.",
				},
			],
		},
		"aac-to-mp3": {
			title: "Convertir AAC a MP3",
			intro: "Convierte audio AAC a MP3 en tu navegador, para reproductores y autorradios que solo hablan MP3.",
			detail: "AAC es el códec más moderno dentro de los M4A y de muchos formatos de streaming; MP3 sigue siendo el suelo de compatibilidad. La conversión decodifica el AAC y recodifica a MP3: dos formatos con pérdida, así que conserva la fuente cuando puedas.",
			tip: "Aquí se convierten pistas .aac desnudas; los archivos M4A (AAC en contenedor MP4) tienen su propia página. Con calidad similar, el MP3 suele pesar algo más que el AAC de origen.",
			faqs: [
				{
					q: "AAC o MP3, ¿cuál es mejor?",
					a: "AAC suena algo mejor a la misma tasa de bits y es estándar en plataformas modernas; MP3 funciona en más dispositivos antiguos. Convierte cuando importe esa compatibilidad.",
				},
				{
					q: "¿Pierdo calidad al convertir AAC a MP3?",
					a: "Algo, de forma irreversible: MP3 recodifica audio que AAC ya comprimió. Con tasas de bits altas la diferencia resulta casi inaudible.",
				},
				{
					q: "¿Sirve esto para archivos M4A?",
					a: "Esta página apunta a pistas .aac sueltas. Para archivos .m4a usa la página específica de M4A a MP3: la misma conversión con una guía más ajustada.",
				},
			],
		},
		"mp3-to-aac": {
			title: "Convertir MP3 a AAC",
			intro: "Recodifica audio MP3 como AAC localmente. Códec moderno, archivos menores, salida amiga de Apple.",
			detail: "AAC suele alcanzar la misma audibilidad que MP3 con menos tasa de bits y es el códec de audio predeterminado en plataformas Apple y muchas cámaras. Convertir no restaura lo perdido por el MP3, pero evita que la penalización de tamaño se acumule.",
			tip: "Si tus fuentes siguen existiendo como archivos sin pérdida, codifica AAC directamente desde ellas. La salida .aac funciona en la mayoría de software actual; unos pocos aparatos antiguos siguen queriendo MP3.",
			faqs: [
				{
					q: "¿AAC es mejor que MP3?",
					a: "En eficiencia sí: calidad comparable con menos tasa de bits. La compatibilidad es algo menor en hardware muy antiguo. Elige según dónde reproduces tus archivos.",
				},
				{
					q: "Si el MP3 funciona, ¿por qué convertir?",
					a: "Los ecosistemas que prefieren AAC, como iPhone, cámaras modernas y algunos flujos de streaming, lo gestionan de forma nativa, y el ahorro de tamaño se acumula en una biblioteca entera.",
				},
				{
					q: "¿Sobreviven etiquetas y carátulas?",
					a: "Parte de los metadatos puede no pasar entre formatos. Convierte un archivo y revisa sus etiquetas antes de procesar una biblioteca completa.",
				},
			],
		},
		"ogg-to-mp3": {
			title: "Convertir OGG a MP3",
			intro: "Convierte audio OGG (Vorbis) a MP3 localmente, por lotes y sin subir nada.",
			detail: "OGG Vorbis aparece en recursos de videojuegos, descargas antiguas y herramientas de Linux. La salida MP3 hace que esos archivos se reproduzcan en autorradios, reproductores y aplicaciones que nunca aprendieron Vorbis.",
			tip: "Ambos formatos tienen pérdida, así que recodificar canjea algo de calidad por compatibilidad. Los archivos que fallen pueden contener vídeo Theora o configuraciones Vorbis inusuales.",
			faqs: [
				{
					q: "¿OGG es lo mismo que Vorbis?",
					a: "OGG es el contenedor; el audio de dentro suele ser Vorbis. Esta página maneja archivos OGG con audio Vorbis, el caso habitual.",
				},
				{
					q: "¿Por qué convertir OGG a MP3?",
					a: "Compatibilidad. Vorbis nunca tuvo soporte de hardware, así que MP3 sigue siendo el formato que aceptan todos los reproductores, editores y formularios.",
				},
				{
					q: "¿Cuánta calidad pierdo?",
					a: "Un poco, por apilar dos codificaciones con pérdida. Con tasas de bits moderadas la diferencia es menor para la mayoría; conserva el OGG si puedes.",
				},
			],
		},
		"m4b-to-mp3": {
			title: "Convertir M4B a MP3",
			intro: "Convierte audiolibros M4B a MP3 en tu navegador. Escúchalos en cualquier reproductor, sin subidas.",
			detail: "M4B es la variante audiolibro de M4A: el mismo audio AAC más marcadores de capítulo y soporte de continuación. La salida MP3 se reproduce en todas partes pero pierde los capítulos: cada archivo se vuelve una pista continua.",
			tip: "Los audiolibros de tienda protegidos con DRM no se convierten. Los libros largos producen archivos grandes; 64–128 kbps bastan de sobra para narración.",
			faqs: [
				{
					q: "¿Sobreviven los capítulos?",
					a: "No. MP3 no lleva marcadores de capítulo aquí, así que el resultado es una única pista lineal. Anota las marcas de tiempo antes de convertir si dependes de ellas.",
				},
				{
					q: "¿Qué tasa de bits conviene a los audiolibros?",
					a: "64–128 kbps bastan para narración: la voz necesita mucho menos que la música. Ajustes menores mantienen los libros largos en un tamaño manejable.",
				},
				{
					q: "¿Puedo convertir audiolibros comprados?",
					a: "Solo archivos sin DRM. Las compras protegidas fallan por diseño; esta herramienta procesa libros que posees sin restricciones de uso.",
				},
			],
		},
		"amr-to-mp3": {
			title: "Convertir AMR a MP3",
			intro: "Conviete grabaciones de voz AMR a MP3 localmente. Formato habitual de teléfonos antiguos y dictáfonos.",
			detail: "AMR es un códec de voz de banda estrecha de los primeros móviles: archivos minúsculos con sonido de teléfono. La salida MP3 se reproduce en cualquier parte sin el software del grabador original.",
			tip: "AMR no puede superar su fuente de calidad telefónica; la conversión va de compatibilidad, no de fidelidad. Se decodifican tanto AMR-NB como la variante más ancha AMR-WB.",
			faqs: [
				{
					q: "¿Por qué suena tan antigua mi grabación?",
					a: "AMR de banda estrecha conserva muy poco ancho de banda de audio: estaba pensado para meter voz en llamadas 2G. La conversión lo conserva fielmente; no puede ensanchar lo que nunca se capturó.",
				},
				{
					q: "¿Qué es AMR-WB?",
					a: "AMR de banda ancha, usado por móviles más recientes para voz de mayor calidad. Ambas variantes se convierten; las fuentes de banda ancha suenan claramente más claras en el MP3.",
				},
				{
					q: "¿Puedo convertir una carpeta entera de grabaciones?",
					a: "Sí. Añádelas todas a la cola y conviértelas de una vez, descargándolas individualmente o como ZIP.",
				},
			],
		},
		"ac3-to-mp3": {
			title: "Convertir AC3 a MP3",
			intro: "Convierte audio AC3 (Dolby Digital) a MP3 en tu navegador, desde rips de DVD y grabaciones.",
			detail: "AC3 lleva sonido envolvente 5.1 de DVDs y algunas cámaras; MP3 es estéreo. La conversión mezcla los canales a estéreo: adecuado para escuchar, no para salida directa a cine en casa.",
			tip: "La mezcla envolvente cambia el balance de canales por diseño. Conserva el AC3 cuando un receptor pueda decodificarlo, y convierte primero una muestra para comprobar que te gusta la mezcla estéreo.",
			faqs: [
				{
					q: "¿Qué pasa con los canales 5.1?",
					a: "Se mezclan a estéreo. Diálogo, música y efectos sobreviven; la colocación envolvente, lógicamente, no.",
				},
				{
					q: "¿Para qué convertir AC3?",
					a: "Reproductores portátiles, algunos televisores y editores no tienen decodificador AC3. El MP3 se reproduce en todas partes y es mucho más fácil de manejar.",
				},
				{
					q: "¿Se pierde calidad al convertir?",
					a: "AC3 ya es con pérdida, y MP3 añade su propia codificación. Con una tasa de bits razonable, el resultado estéreo conserva la calidad audible de la fuente.",
				},
			],
		},
		"opus-to-wav": {
			title: "Convertir Opus a WAV",
			intro: "Decodifica audio Opus a WAV sin comprimir localmente, listo para editores sin soporte de Opus.",
			detail: "Algunos DAW y herramientas siguen rechazando Opus. La salida WAV se carga en cualquier parte y lleva exactamente el audio que Opus almacenaba: tras decodificar no hay más pérdida.",
			tip: "Espera archivos grandes, unos 10 MB por minuto de estéreo. Para escuchar o compartir en lugar de editar, Opus a MP3 suele ser el mejor trato.",
			faqs: [
				{
					q: "¿Por qué WAV y no FLAC?",
					a: "WAV es el formato de importación más seguro para editores y hardware. FLAC es la alternativa sin pérdida más ligera una vez el archivo sale del flujo de edición.",
				},
				{
					q: "¿La conversión añade calidad?",
					a: "No, y tampoco se pierde nada: decodificar Opus es sin pérdida. El WAV contiene exactamente lo que contenía el Opus, con toda la fidelidad de muestra.",
				},
				{
					q: "¿Puedo convertir grabaciones por lotes?",
					a: "Sí. Añade el conjunto completo; cada archivo se convierte con los mismos ajustes y puede descargarse individualmente o junto.",
				},
			],
		},
		"mkv-to-mp3": {
			title: "Convertir MKV a MP3",
			intro: "Extrae el audio de vídeos MKV como MP3, localmente en tu navegador.",
			detail: "Los contenedores MKV guardan audio de todo tipo —normalmente AAC, AC3, FLAC o DTS—. Esta página decodifica la pista de audio y codifica MP3; el vídeo no se procesa y el archivo nunca sale de tu dispositivo.",
			tip: "Los archivos con varias pistas de audio convierten la primera. Comprueba un resultado antes de convertir un archivo por lotes, sobre todo si hay pistas de comentario.",
			faqs: [
				{
					q: "¿Qué pista de audio se convierte?",
					a: "La primera pista de audio del contenedor. Si tu archivo tiene comentarios o pistas alternativas, verifica el resultado antes de procesar más archivos.",
				},
				{
					q: "¿Se modifica el archivo MKV?",
					a: "Nunca. Obtienes un MP3 nuevo y aparte; el vídeo original queda exactamente como está en tu dispositivo.",
				},
				{
					q: "¿Hasta qué tamaño puedo convertir?",
					a: "El techo lo marca la memoria del navegador: el búfer se agota justo por debajo de 2 GiB. Los rips largos y con mucha tasa de bits pueden fallar en equipos con poca RAM.",
				},
			],
		},
		"avi-to-mp3": {
			title: "Convertir AVI a MP3",
			intro: "Saca el audio de vídeos AVI antiguos como MP3, sin subir las grabaciones.",
			detail: "AVI es el contenedor de los años noventa que sigue rondando archivos de cámaras y descargas viejas. Su audio suele ser ya MP3 o PCM; esta página lo decodifica y produce un MP3 limpio que se reproduce en todas partes.",
			tip: "Los AVI antiguos a veces tienen índices rotos, y los archivos que no pueden situarse pueden no decodificarse. Prueba un archivo antes de convertir un archivo por lotes.",
			faqs: [
				{
					q: "Si el AVI ya lleva audio MP3, ¿por qué convertir?",
					a: "El resultado es un archivo de audio puro, independiente y con especificaciones uniformes, sin el flujo de vídeo ni las rarezas del contenedor, listo para reproductores y editores.",
				},
				{
					q: "Mi AVI no convierte, ¿está roto?",
					a: "Puede que sí, o que lo esté su índice. Los archivos de descargas interrumpidas y discos que fallan suelen decodificarse a medias o nada. Prueba otro archivo para acotar el problema.",
				},
				{
					q: "¿Influye la calidad del vídeo?",
					a: "En absoluto: solo se decodifica el flujo de audio. La pista de vídeo se ignora por completo.",
				},
			],
		},
		"wmv-to-mp3": {
			title: "Convertir WMV a MP3",
			intro: "Convierte vídeos Windows Media a audio MP3 localmente, sin software de la época de Silverlight.",
			detail: "Los archivos WMV vienen de herramientas Windows antiguas, adjuntos de correo y portales de descargas. Solo se decodifica el flujo de audio —normalmente WMA— y se recodifica como MP3 que se reproduce en cualquier parte.",
			tip: "Los archivos WMV protegidos con DRM no se convierten, y unas pocas variantes muy viejas pueden no decodificarse en el navegador; esas necesitan el software Windows original.",
			faqs: [
				{
					q: "¿Se pueden convertir archivos WMV protegidos?",
					a: "No. Los archivos con DRM fallan por diseño. Los que grabaste o descargaste sin restricciones se convierten con normalidad.",
				},
				{
					q: "¿Se procesa el vídeo?",
					a: "No. Solo se decodifica el flujo de audio; el WMV queda intacto en tu dispositivo y no se sube nada.",
				},
				{
					q: "¿Puedo convertir descargas antiguas por lotes?",
					a: "Sí. Añade los archivos de la carpeta y conviértelos de una vez. Los protegidos o indecodificables se informan como fallos, no se saltan en silencio.",
				},
			],
		},
		"flv-to-mp3": {
			title: "Convertir FLV a MP3",
			intro: "Extrae audio MP3 de vídeos FLV de la era Flash, localmente en tu navegador.",
			detail: "FLV es el contenedor de vídeo Flash de la web de los 2000, que sigue en carpetas de descargas viejas. Su audio suele ser MP3 o AAC; la conversión produce un MP3 limpio e independiente.",
			tip: "Los FLV sin pista de audio —grabaciones de pantalla silenciosas— no tienen nada que extraer y fallan con un aviso claro. Las descargas corruptas de servidores muertos hace tiempo pueden no decodificarse.",
			faqs: [
				{
					q: "¿Por qué todavía tengo archivos FLV?",
					a: "La web de los 2000 funcionaba con Flash, y las carpetas de descargas antiguas conservan aquella época. Convierte el audio que te importe; lo demás ya puede descansar.",
				},
				{
					q: "¿Qué audio hay dentro de un FLV?",
					a: "Normalmente MP3 o AAC. Cualquiera de los dos se decodifica aquí y se recodifica a un MP3 nuevo con la tasa de bits que elijas.",
				},
				{
					q: "¿Puedo convertir varios FLV a la vez?",
					a: "Sí. Pon en cola el lote completo; los resultados se descargan individualmente o como ZIP, todo procesado en tu dispositivo.",
				},
			],
		},
		"mp4-to-wav": {
			title: "Convertir MP4 a WAV",
			intro: "Extrae audio WAV sin comprimir de vídeos MP4, por completo en tu dispositivo.",
			detail: "Pensado para flujos de edición: la pista de audio del vídeo se decodifica a WAV que cualquier editor acepta. La página hermana de MP4 a MP3 cubre escucha y compartición; esta es para producción.",
			tip: "WAV es grande: unos 10 MB por minuto de estéreo. Los vídeos muy largos pueden agotar la memoria del navegador en equipos con poca RAM.",
			faqs: [
				{
					q: "¿MP4 a MP3 o MP4 a WAV?",
					a: "MP3 para escuchar y compartir: más pequeño y universal. WAV para editar y procesar, donde la entrada sin pérdida evita acumular compresiones.",
				},
				{
					q: "¿Se modifica el vídeo original?",
					a: "Nunca. El MP4 queda exactamente igual y recibes un archivo WAV aparte.",
				},
				{
					q: "¿Cuáles son los límites de tamaño?",
					a: "La memoria del navegador es el techo: el búfer se agota justo por debajo de 2 GiB. Los vídeos corrientes van bien; las grabaciones de varias horas pueden no llegar en equipos pequeños.",
				},
			],
		},
		"avif-to-png": {
			title: "Convertir AVIF a PNG",
			intro: "Convierte imágenes AVIF a PNG localmente, para editores y formularios que aún no aceptan AVIF.",
			detail: "AVIF se decodifica a píxeles exactos y PNG los vuelve a guardar sin pérdida, transparencia incluida. Útil cuando un flujo —un CMS antiguo, algunos editores— rechaza subidas AVIF.",
			tip: "PNG suele pesar más que AVIF, a veces mucho más con fotografías. Los artefactos que dejó la codificación AVIF original no se pueden deshacer.",
			faqs: [
				{
					q: "¿Convertir AVIF a PNG pierde calidad?",
					a: "No se pierde nada más. El AVIF se decodifica a píxeles exactos y PNG los guarda sin pérdida: lo que ves es lo que el AVIF contenía.",
				},
				{
					q: "¿Por qué pesa más el archivo?",
					a: "AVIF comprime mucho más eficientemente que PNG, sobre todo en fotos. El crecimiento es el coste normal de pasar a un formato sin pérdida y legible en todas partes.",
				},
				{
					q: "¿Se conserva la transparencia?",
					a: "Sí. Los canales alfa del AVIF pasan intactos a PNG. Usa la página de AVIF a JPG solo cuando la transparencia no importe.",
				},
			],
		},
		"avif-to-jpg": {
			title: "Convertir AVIF a JPG",
			intro: "Convierte imágenes AVIF a JPG en tu navegador, para una compatibilidad universal.",
			detail: "JPG se abre literalmente en todas partes; AVIF todavía no. La conversión decodifica el AVIF y codifica JPG con la calidad que elijas. Las zonas transparentes se aplanan sobre blanco.",
			tip: "Prefiere la página de AVIF a PNG cuando importen la transparencia o la edición posterior; JPG es para compartir y formularios que lo exigen. El área de trabajo informa del cambio de tamaño de cada resultado.",
			faqs: [
				{
					q: "¿Qué pasa con las zonas transparentes?",
					a: "JPG no admite transparencia, así que se aplanan sobre blanco. Convierte a PNG cuando la transparencia importe.",
				},
				{
					q: "¿Qué calidad elijo?",
					a: "80–90 sirve para la mayoría de imágenes. Valores menores reducen más el tamaño pero suavizan el detalle; comprueba una muestra antes de convertir por lotes.",
				},
				{
					q: "Si AVIF está bien, ¿por qué convertir?",
					a: "Por los sitios que aún lo rechazan: gestores de contenido antiguos, algunas aplicaciones de escritorio y bastantes formularios de subida.",
				},
			],
		},
		"tiff-to-jpg": {
			title: "Convertir TIFF a JPG",
			intro: "Convierte escaneos y fotos TIFF a JPG localmente. Reduce archivos enormes para compartir y almacenar.",
			detail: "Los TIFF de escáneres y flujos fotográficos son enormes porque guardan todo sin pérdida. JPG canjea una cantidad controlada de calidad por tamaños prácticos: bien para compartir, mal para másteres de archivo.",
			tip: "Los TIFF de varias páginas se convierten por su primera página; trata las demás individualmente. Conserva los TIFF originales cuando los escaneos importen: el JPG es una copia de entrega.",
			faqs: [
				{
					q: "Mi TIFF tiene varias páginas, ¿qué se convierte?",
					a: "La primera página. Si necesitas todas, divide el TIFF antes o convierte las páginas como archivos separados.",
				},
				{
					q: "¿Y los TIFF CMYK de flujos de imprenta?",
					a: "El manejo de color durante la conversión puede desplazar tonos exactos. Convierte un archivo y comprueba los colores antes de procesar un archivo de imprenta.",
				},
				{
					q: "¿Qué calidad conviene a los escaneos?",
					a: "80–90 funciona para la mayoría de documentos y fotos. Los escaneos con mucho texto quedan más nítidos con más calidad, o usa la página de TIFF a PNG para una salida sin pérdida.",
				},
			],
		},
		"tiff-to-png": {
			title: "Convertir TIFF a PNG",
			intro: "Convierte imágenes TIFF a PNG sin pérdida localmente, transparencia incluida.",
			detail: "PNG conserva cada píxel igual que TIFF, con tamaños más amables para la web y en aplicaciones que no leen TIFF. La elección correcta para escaneos de texto, arte lineal e imágenes con alfa.",
			tip: "PNG no reducirá los escaneos fotográficos tanto como JPG: es el precio de no perder nada. Los TIFF de varias páginas se convierten por su primera página.",
			faqs: [
				{
					q: "TIFF y PNG, ¿no son ambos sin pérdida?",
					a: "Lo son. PNG es más ligero en funciones que rara vez necesitas y está muchísimo más extendido en la web y las aplicaciones cotidianas.",
				},
				{
					q: "¿Los TIFF multipágina se convierten enteros?",
					a: "Solo la primera página se convierte en PNG. Divide el archivo antes si necesitas cada página como imagen propia.",
				},
				{
					q: "¿Se conserva la transparencia?",
					a: "Sí. Los canales alfa del TIFF pasan intactos a PNG.",
				},
			],
		},
		"psd-to-png": {
			title: "Convertir PSD a PNG",
			intro: "Exporta archivos Photoshop PSD como imágenes PNG localmente, sin Photoshop ni subidas.",
			detail: "La vista compuesta del PSD —el archivo tal como se ve aplanado— se convierte en un PNG píxel-exacto. Adecuado para compartir diseños y vistas previas de archivos Photoshop sin software de Adobe.",
			tip: "Las capas se aplanan en una sola imagen: no se exportan por separado y el texto pasa a píxeles. Los modos de fusión complejos pueden renderizarse con ligeras diferencias respecto a Photoshop.",
			faqs: [
				{
					q: "¿Sobreviven las capas?",
					a: "No. El resultado es el compuesto aplanado, tal como se ve con todas las capas visibles. Exporta las capas por separado desde Photoshop si las necesitas.",
				},
				{
					q: "¿Qué pasa con las capas de texto?",
					a: "Se renderizan como píxeles en el compuesto. El texto editable requiere el PSD original en un editor.",
				},
				{
					q: "¿Se verá exactamente como en Photoshop?",
					a: "Muy cerca. La mayoría de archivos coinciden; los modos de fusión exóticos y las capas de ajuste pueden diferir en poco. Comprueba un archivo antes de exportar por lotes.",
				},
			],
		},
		"psd-to-jpg": {
			title: "Convertir PSD a JPG",
			intro: "Convierte archivos Photoshop PSD a JPG localmente para compartirlos sin peso.",
			detail: "El mismo compuesto aplanado que la exportación a PNG, codificado como JPG con la calidad que elijas: la opción práctica para vistas previas por correo y formularios donde el PNG pesa demasiado.",
			tip: "Las zonas transparentes se aplanan sobre blanco. Conserva el PSD como máster de trabajo; el JPG es una copia de entrega que puedes regenerar cuando quieras.",
			faqs: [
				{
					q: "¿PSD a PNG o PSD a JPG?",
					a: "PNG para resultados píxel-exactos y transparencia; JPG para archivos mucho más pequeños. Ambos aplanan el compuesto igual.",
				},
				{
					q: "¿Por qué mi fondo transparente sale blanco?",
					a: "JPG no puede guardar transparencia, así que se aplana sobre blanco. Usa la página de PSD a PNG cuando el fondo deba seguir siendo transparente.",
				},
				{
					q: "¿Qué calidad elijo?",
					a: "80–90 sirve para la mayoría de vistas previas. Como el PSD sigue siendo tu máster, siempre puedes reexportar con otra calidad.",
				},
			],
		},
		"ico-to-png": {
			title: "Convertir ICO a PNG",
			intro: "Convierte iconos ICO a PNG localmente: recupera favicons e iconos de Windows como imágenes normales.",
			detail: "ICO empaqueta uno o más tamaños de icono en un solo archivo. Esta conversión decodifica el icono y guarda un PNG que aceptan cualquier editor, navegador y documento.",
			tip: "Un ICO puede contener varias resoluciones; el decodificador elige un fotograma y el área de trabajo muestra las dimensiones del resultado. Los fondos transparentes se conservan.",
			faqs: [
				{
					q: "Mi ICO tiene varios tamaños, ¿cuál obtengo?",
					a: "El decodificador elige un fotograma guardado y el área de trabajo muestra las dimensiones del resultado. Convierte otra vez desde un máster más grande si necesitas otro tamaño.",
				},
				{
					q: "¿Se conserva la transparencia?",
					a: "Sí. La transparencia del icono pasa limpia a PNG, a diferencia de JPG, que la aplanaría.",
				},
				{
					q: "¿Para qué convertir un ICO?",
					a: "El PNG se abre en editores, herramientas de diseño y documentos; el ICO existe casi solo para ejecutables de Windows y favicons. Es la forma de ver y reutilizar un icono de verdad.",
				},
			],
		},
		"bmp-to-jpg": {
			title: "Convertir BMP a JPG",
			intro: "Convierte imágenes BMP a JPG localmente. De mapas de bits gigantes sin comprimir a archivos compartibles.",
			detail: "BMP guarda píxeles en crudo casi sin compresión: programas de pintura y capturas de software antiguo. JPG recorta el tamaño drásticamente con una calidad que tú controlas.",
			tip: "El arte lineal y las capturas con texto pequeño pueden suavizarse en JPG; para eso la alternativa sin pérdida es PNG. El área de trabajo muestra el cambio de tamaño real por archivo.",
			faqs: [
				{
					q: "¿Por qué los BMP pesan tanto?",
					a: "Guardan cada píxel sin comprimir, a menudo con relleno de alineación. Una copia JPG suele ser una fracción pequeña del tamaño con calidad visualmente similar.",
				},
				{
					q: "¿Hay que vigilar la transparencia del BMP?",
					a: "Casi nunca: la mayoría de BMP son totalmente opacos. Y JPG no admite transparencia de todos modos, así que en la práctica no hay nada que perder.",
				},
				{
					q: "¿Mejor usar PNG en lugar de JPG?",
					a: "Para capturas, diagramas y cualquier cosa con texto, sí: PNG es sin pérdida y ese tipo de imágenes comprime bien. JPG va mejor con contenido fotográfico.",
				},
			],
		},
		"html-to-md": {
			title: "Convertir HTML a Markdown",
			intro: "Convierte páginas y fragmentos HTML a Markdown localmente: texto limpio para documentación y sistemas de notas.",
			detail: "Encabezados, listas, enlaces, tablas y código se asignan a Markdown; los scripts y los estilos se descartan. Aliméntalo con páginas guardadas, exportaciones de documentación o HTML de correo que quieras en un sistema de texto plano.",
			tip: "Las maquetaciones profundamente anidadas y las tablas complejas se simplifican en lugar de sobrevivir. Revisa el Markdown tras convertir: todo ocurre en tu navegador.",
			faqs: [
				{
					q: "¿Qué pasa con los scripts y los estilos?",
					a: "Se descartan. La conversión apunta a la estructura del contenido —texto, encabezados, listas, enlaces, tablas y código—, no a la presentación.",
				},
				{
					q: "¿Cómo se convierten las tablas?",
					a: "Las tablas sencillas pasan a tablas de barras de Markdown; las de anidado profundo o celdas combinadas se simplifican. Revisa la salida cuando las tablas importen.",
				},
				{
					q: "¿Mi HTML se sube a algún sitio?",
					a: "No. La conversión funciona en tu navegador; la página o el fragmento se procesa en memoria en tu dispositivo.",
				},
			],
		},
		"md-to-html": {
			title: "Convertir Markdown a HTML",
			intro: "Convierte Markdown en HTML independiente localmente, listo para sitios estáticos y plantillas.",
			detail: "Encabezados, listas, bloques de código y enlaces se convierten en HTML semántico. Útil para sitios estáticos, builds de documentación y cualquier caso donde un generador completo sea excesivo.",
			tip: "No incluye estilos: la salida es marcado semántico para tu propio CSS. El HTML en línea escrito dentro del Markdown generalmente se descarta.",
			faqs: [
				{
					q: "¿La salida incluye CSS?",
					a: "No. Obtienes HTML semántico limpio, para dar estilo con tu propia hoja de estilos.",
				},
				{
					q: "¿Puedo abrir el archivo directamente en el navegador?",
					a: "Sí. El resultado es un archivo HTML independiente: se abre y se renderiza sin ningún paso de build.",
				},
				{
					q: "¿Qué funciones de Markdown se admiten?",
					a: "El conjunto estándar: encabezados, listas, tablas, código delimitado, enlaces y énfasis. El HTML en línea incrustado generalmente se elimina.",
				},
			],
		},
		"docx-to-html": {
			title: "Convertir DOCX a HTML",
			intro: "Publica documentos Word como HTML localmente: encabezados, listas y tablas como marcado limpio.",
			detail: "La conversión asigna la estructura de Word a HTML: encabezados, énfasis, listas, tablas y enlaces. Adecuado para llevar documentos a intranets, centros de ayuda y blogs sin los daños del copy-paste.",
			tip: "Encabezados y pies, cuadros de texto y cambios registrados se omiten. Revisa la salida HTML de un documento representativo antes de publicar un lote.",
			faqs: [
				{
					q: "¿Qué pasa con las imágenes?",
					a: "Pueden aparecer referencias en el HTML, pero los archivos de imagen no se exportan. Vuelve a añadir las imágenes desde el documento original.",
				},
				{
					q: "¿El marcado queda limpio?",
					a: "La estructura se asigna a etiquetas HTML semánticas. Las maquetaciones complejas de Word se simplifican; revisa la salida antes de publicar nada importante.",
				},
				{
					q: "¿El documento se sube?",
					a: "No. El motor de conversión funciona en tu navegador con WebAssembly y el documento nunca sale de tu dispositivo.",
				},
			],
		},
		"rtf-to-docx": {
			title: "Convertir RTF a DOCX",
			intro: "Convierte documentos RTF al DOCX moderno localmente, sin Word.",
			detail: "RTF es el formato de texto enriquecido de los años ochenta que algunas aplicaciones y exportadores legados aún producen. La salida DOCX se abre limpia en Word, LibreOffice y Google Docs con el formato intacto.",
			tip: "Las extensiones RTF muy viejas o exóticas pueden convertir de forma imperfecta. Comprueba un archivo antes de convertir un archivo por lotes.",
			faqs: [
				{
					q: "¿Sobrevive el formato?",
					a: "El texto enriquecido básico —negrita, cursiva, listas, tablas, colores— pasa bien. Las funciones RTF exóticas de aplicaciones de nicho pueden simplificarse.",
				},
				{
					q: "¿Por qué pasar de RTF a DOCX?",
					a: "El soporte de RTF se está desvaneciendo del software; DOCX es el estándar moderno que todo procesador de textos maneja bien.",
				},
				{
					q: "¿Necesito Word para esto?",
					a: "No. La conversión funciona en tu navegador; el RTF se lee y se convierte por completo en tu dispositivo.",
				},
			],
		},
		"odt-to-docx": {
			title: "Convertir ODT a DOCX",
			intro: "Convierte archivos OpenDocument Text a DOCX localmente. Documentos de LibreOffice, listos para Word.",
			detail: "ODT es el formato de LibreOffice y OpenOffice; DOCX es el que suelen exigir las oficinas y los clientes. La conversión asigna estilos, listas y tablas para que los documentos viajen entre ambos mundos sin volver a escribirlos.",
			tip: "Funciones ODT complejas como los documentos maestros y algunas maquetaciones de marcos pueden simplificarse. Convierte una muestra representativa antes de migrar un archivo entero.",
			faqs: [
				{
					q: "¿Qué tan bien se asigna el formato?",
					a: "Estilos, listas y tablas se traducen bien. Las construcciones muy específicas de LibreOffice pueden perder algo de pulido: comprueba una muestra primero.",
				},
				{
					q: "¿Sigo necesitando LibreOffice?",
					a: "Para la conversión no: ocurre en tu navegador. LibreOffice sigue siendo útil para editar, pero Word abre el resultado directamente.",
				},
				{
					q: "¿Puedo convertir una carpeta entera?",
					a: "Sí. Pon los archivos en cola y conviértelos de una vez, descargándolos individualmente o como ZIP.",
				},
			],
		},
		"epub-to-md": {
			title: "Convertir EPUB a Markdown",
			intro: "Extrae el contenido de libros electrónicos EPUB como Markdown localmente: para notas, wikis y archivos de texto plano.",
			detail: "Los capítulos se vuelven encabezados y párrafos de Markdown; el formato se simplifica a lo que Markdown expresa. Útil para notas personales, copias de lectura en texto plano y sacar tus propios manuscritos del empaquetado de libro electrónico.",
			tip: "Solo se convierten EPUB sin DRM. Las imágenes no se exportan, y las notas al pie o las maquetaciones complejas se simplifican: compara la salida con el libro.",
			faqs: [
				{
					q: "¿Puedo convertir libros comprados?",
					a: "Solo archivos sin DRM. Las compras de tienda protegidas fallan por diseño; esta herramienta procesa libros que posees sin restricciones.",
				},
				{
					q: "¿Pasan las imágenes?",
					a: "No: la conversión apunta al texto. Las ilustraciones se quedan en el EPUB original.",
				},
				{
					q: "¿Cómo se trata la estructura?",
					a: "Los títulos de capítulo se vuelven encabezados y el cuerpo, párrafos. Las notas al final, las capitulares y las maquetaciones a columnas se simplifican a Markdown plano.",
				},
			],
		},
		"heic-converter": {
			title: "Convertidor de HEIC",
			intro: "Convierte fotos HEIC a JPG o PNG en tu navegador. El formato de iPhone, legible en todas partes, sin subidas.",
			detail: "HEIC es el formato fotográfico eficiente que iPhone usa desde iOS 11, y muchos sitios y aplicaciones todavía no saben leerlo. Elige una conversión para preseleccionarla: JPG para archivos compartibles más pequeños, PNG para edición sin pérdida y formularios estrictos.",
			tip: "Algunas variantes HEIC pueden no decodificarse: conserva el original y reexporta desde el dispositivo de origen si ocurre. Las fotos en vivo convierten su imagen fija; el clip de vídeo adjunto es un archivo aparte.",
			faqs: [
				{
					q: "¿HEIC a JPG o a PNG para compartir?",
					a: "JPG: aceptado en todas partes y mucho más pequeño. PNG va bien para edición y formularios que exigen archivos sin pérdida.",
				},
				{
					q: "¿Otros dispositivos leen HEIC directamente?",
					a: "La mayoría de plataformas actuales sí, pero el software antiguo, los formularios web y los periféricos a menudo no. Pasar a JPG o PNG elimina la duda.",
				},
				{
					q: "¿Estas conversiones son gratis y privadas?",
					a: "Las dos cosas. Todas las herramientas enlazadas aquí son gratuitas, no piden cuenta y procesan las fotos en tu navegador, no en un servidor.",
				},
			],
		},
		"wav-converter": {
			title: "Convertidor de WAV",
			intro: "Convierte audio WAV a MP3, FLAC y más — y desde ellos — localmente en tu navegador.",
			detail: "WAV es audio de estudio sin comprimir: enorme pero universal. Pasa WAV a MP3 para compartir o a FLAC para archivos sin pérdida, o genera WAV desde MP3, M4A, FLAC, Opus —y desde vídeo— cuando un editor necesite entrada sin comprimir.",
			tip: "Vigila la dirección: WAV a con pérdida encoge para siempre, y con pérdida a WAV solo agranda el archivo sin añadir calidad. Guarda másteres sin pérdida cuando el audio importe.",
			faqs: [
				{
					q: "¿WAV o FLAC como formato de archivo?",
					a: "Ambos son sin pérdida; FLAC pesa la mitad y etiqueta correctamente. Guarda WAV solo para herramientas que lo exijan expresamente.",
				},
				{
					q: "¿En qué dirección convierto?",
					a: "Desde WAV cuando necesites archivos menores; hacia WAV cuando un editor o dispositivo exija entrada sin comprimir.",
				},
				{
					q: "¿Qué tasa de bits para las salidas con pérdida?",
					a: "128 kbps para voz, 192 kbps o más para música. El área de trabajo muestra el tamaño de cada resultado para sopesar calidad y espacio.",
				},
			],
		},
		"flac-converter": {
			title: "Convertidor de FLAC",
			intro: "Convierte FLAC a MP3 o WAV — y hacia FLAC desde MP3 o WAV — en tu navegador.",
			detail: "FLAC es el formato de archivo sin pérdida: cada muestra conservada a la mitad del tamaño de WAV. Pasa FLAC a MP3 para copias portátiles, a WAV para editores, o hacia FLAC desde WAV sin pérdida o desde MP3 como mejora de contenedor.",
			tip: "MP3 a FLAC envuelve la calidad existente y jamás la restaura. Conserva los másteres FLAC: recodifican limpiamente a cualquier formato que necesites después.",
			faqs: [
				{
					q: "¿Merece la pena FLAC frente a MP3?",
					a: "Para archivar, sí: calidad perfecta que luego se convierte a cualquier cosa. En portabilidad y tamaño, MP3 sigue ganando; mucha gente conserva ambos.",
				},
				{
					q: "¿Convertir MP3 a FLAC arregla la calidad?",
					a: "No. El FLAC guarda exactamente la salida decodificada del MP3; la codificación con pérdida anterior es permanente.",
				},
				{
					q: "¿Qué reproduce archivos FLAC?",
					a: "La mayoría del software actual, los móviles y muchos reproductores dedicados. Las excepciones son la razón de que las copias MP3 sigan existiendo.",
				},
			],
		},
		"mp3-to-ogg": {
			title: "Convertir MP3 a OGG",
			intro: "Convierte audio MP3 a OGG (Vorbis) en tu navegador, por lotes y sin subidas.",
			detail: "OGG Vorbis es el formato de audio abierto que prefieren los motores de videojuegos, las herramientas de Linux y la incrustación web. Esta conversión decodifica tu MP3 y codifica OGG; no puede recuperar la calidad que el MP3 ya perdió, pero Vorbis suele igualar la audibilidad del MP3 con tamaños similares o menores.",
			tip: "Muchas aplicaciones y autorradios aún carecen de soporte Vorbis: conserva el MP3 cuando la reproducción universal importe más que un formato abierto.",
			faqs: [
				{
					q: "¿Por qué convertir MP3 a OGG?",
					a: "OGG está libre de patentes y es estándar en desarrollo de videojuegos, reproductores de código abierto y flujos de audio HTML5. Convierte cuando un proyecto o plataforma exige Vorbis.",
				},
				{
					q: "¿Perderé calidad?",
					a: "Es una codificación con pérdida apilada sobre otra: trátalo como un cambio de formato, no como una mejora. Con tasas de bits moderadas Vorbis es eficiente y la diferencia es sutil.",
				},
				{
					q: "¿Funciona sin conexión?",
					a: "Tras la primera conversión, el motor de audio se descarga y queda en caché; convertir funciona sin conexión. Los archivos nunca salen de tu dispositivo.",
				},
			],
		},
		"jpg-to-webp": {
			title: "Convertir JPG a WebP",
			intro: "Convierte fotos JPG a WebP localmente. Adelgaza sitios web y almacenamiento con un formato moderno, sin subidas.",
			detail: "WebP normalmente comprime la misma imagen más pequeña que JPG con calidad comparable. Elige una calidad, convierte y compara el cambio de tamaño que informa el área de trabajo antes de sustituir tus originales.",
			tip: "La conversión no añade calidad: un JPG viejo y muy comprimido seguirá igual en WebP. Conserva másteres JPG cuando software muy antiguo deba abrir los archivos.",
			faqs: [
				{
					q: "¿WebP de verdad pesa menos que JPG?",
					a: "Normalmente sí, entre un 20 y un 30 % con calidad similar. El área de trabajo informa del tamaño real de cada resultado: juzga por imagen, no por costumbre.",
				},
				{
					q: "¿Se conserva la transparencia?",
					a: "Tu JPG no tiene transparencia que conservar: el resultado WebP será totalmente opaco. WebP admite alfa solo cuando la imagen de origen lo tiene.",
				},
				{
					q: "¿Qué calidad conviene a las fotos?",
					a: "75–85 es el rango habitual para fotografías. Revisa el texto pequeño y los bordes a tamaño completo antes de bajarlo más.",
				},
			],
		},
		"png-to-ico": {
			title: "Convertir PNG a ICO",
			intro: "Convierte imágenes PNG a ICO localmente. Convierte logotipos en favicons e iconos de Windows sin software de diseño.",
			detail: "ICO es el formato de icono detrás de los favicons del navegador y los accesos directos de Windows. Esta conversión codifica tu PNG como un ICO que sitios y aplicaciones aceptan, conservando la transparencia.",
			tip: "Los favicons funcionan mejor desde fuentes cuadradas: recorta a un cuadrado primero. El empaquetado multip tamaño no está incluido; genera el tamaño que necesites y publícalo como favicon.ico.",
			faqs: [
				{
					q: "¿Esto es un generador de favicons?",
					a: "Produce el archivo ICO en sí. Renómbralo a favicon.ico, colócalo en la raíz de tu sitio o referencíalo en tus páginas.",
				},
				{
					q: "¿Se conserva la transparencia?",
					a: "Sí. Los canales alfa del PNG pasan al ICO, y es lo que hace que los iconos redondeados o con forma se vean bien.",
				},
				{
					q: "¿Qué tamaño de PNG conviene?",
					a: "Una imagen cuadrada de 256×256 píxeles o mayor da la reducción más limpia a los tamaños de icono de 16–48 px.",
				},
			],
		},
		"jpg-to-ico": {
			title: "Convertir JPG a ICO",
			intro: "Convierte imágenes JPG a ICO localmente para favicons e iconos de Windows, sin software de diseño.",
			detail: "Los archivos ICO pueden llevar transparencia y JPG no: tu icono conserva un fondo aplanado. Para logotipos que necesitan esquinas transparentes, parte del máster PNG con la página de PNG a ICO.",
			tip: "Las fuentes cuadradas y de alto contraste se leen mejor en los tamaños de favicon de 16–48 px. Conserva el JPG original; el ICO es un recurso que puedes regenerar cuando quieras.",
			faqs: [
				{
					q: "¿Por qué mi fondo salió blanco?",
					a: "JPG no tiene transparencia, así que nada hay que conservar: el icono es totalmente opaco. Usa una fuente PNG cuando la forma necesite bordes transparentes.",
				},
				{
					q: "¿Qué tamaños tiene el ICO?",
					a: "Es un icono de un solo tamaño construido desde tu imagen. Escala a un cuadrado antes de convertir para el mejor render pequeño.",
				},
				{
					q: "¿Puedo usarlo como favicon?",
					a: "Sí. Renómbralo a favicon.ico y colócalo en la raíz del sitio, o enlázalo desde tus páginas.",
				},
			],
		},
		"gif-to-png": {
			title: "Convertir GIF a PNG",
			intro: "Convierte imágenes GIF a PNG localmente. Extrae un fotograma limpio de cualquier GIF, sin subidas.",
			detail: "Los GIF animados se convierten en una imagen fija —el primer fotograma— como PNG sin pérdida con transparencia conservada. Los GIF estáticos se convierten directamente, píxel a píxel.",
			tip: "¿Necesitas otro fotograma? Extráelo antes en un editor: esta conversión toma siempre el primer fotograma. PNG conserva la transparencia que el formato GIF lleva y que JPG aplanaría.",
			faqs: [
				{
					q: "¿Qué pasa con la animación?",
					a: "Pasa a ser una imagen fija del primer fotograma. Aquí no se produce salida animada.",
				},
				{
					q: "¿La conversión es sin pérdida?",
					a: "Sí. El fotograma decodificado se guarda exactamente como PNG lo almacena, sin más pérdida de calidad.",
				},
				{
					q: "¿Puedo convertir muchos GIF a la vez?",
					a: "Sí. Añade el lote completo; cada archivo se convierte con los mismos ajustes y se descarga individualmente o como ZIP.",
				},
			],
		},
		"gif-to-jpg": {
			title: "Convertir GIF a JPG",
			intro: "Convierte imágenes GIF a JPG en tu navegador: fijos más pequeños para compartir y formularios de subida.",
			detail: "El primer fotograma del GIF se codifica como JPG con la calidad que elijas. La transparencia se aplana sobre blanco y el resultado es una imagen fija normal, adecuada para vistas previas y formularios con límite de tamaño.",
			tip: "Cuando el fotograma deba seguir siendo transparente o píxel-exacto, usa la página de GIF a PNG: JPG conviene a los fotogramas de estilo fotográfico.",
			faqs: [
				{
					q: "¿Sobrevive la animación?",
					a: "No: obtienes una imagen fija del primer fotograma en JPG.",
				},
				{
					q: "¿Por qué mi fondo salió blanco?",
					a: "JPG no admite transparencia, así que las zonas transparentes se aplanan sobre blanco. Elige la página de GIF a PNG para conservarlas.",
				},
				{
					q: "¿Qué calidad elijo?",
					a: "80–90 sirve para la mayoría de fijos. Los valores menores reducen más el archivo pero suavizan bordes: revisa el resultado antes de convertir por lotes.",
				},
			],
		},
		"compress-png": {
			title: "Compresor de PNG",
			intro: "Comprime imágenes PNG localmente y compara el ahorro real. Entra un formato, sale más pequeño.",
			detail: "Esta página recodifica PNG con los ajustes de calidad del área de trabajo: el modo sin pérdida conserva cada píxel exacto, y los ajustes más bajos canjean algo de fidelidad por archivos mucho menores. Cada archivo informa de su tamaño antes y después.",
			tip: "Recodificar no garantiza ahorro: los PNG ya optimizados apenas pueden encoger. Fíate de los números del área de trabajo y conserva el original cuando un archivo se resista.",
			faqs: [
				{
					q: "¿La compresión es sin pérdida?",
					a: "Tú eliges: el modo de calidad sin pérdida mantiene los píxeles idénticos, y los ajustes más bajos reducen más a costa de algo de fidelidad.",
				},
				{
					q: "¿Por qué mi PNG no encoge?",
					a: "Probablemente lo guardó un flujo ya optimizado: queda poca redundancia por eliminar. El área de trabajo mostrará casi ningún cambio.",
				},
				{
					q: "¿WebP sería aún más pequeño?",
					a: "A menudo sí, pero PNG sigue siendo la respuesta cuando un formulario o flujo exige el formato. Prueba la página del compresor de imágenes para comparar formatos.",
				},
			],
		},
		"compress-jpeg": {
			title: "Compresor de JPEG",
			intro: "Comprime imágenes JPG localmente. Elige un nivel de calidad menor y mira bajar el tamaño de verdad, sin subidas.",
			detail: "La compresión JPG depende de la calidad: recodificar con un ajuste menor descarta más datos y encoge el archivo, con artefactos que tú controlas. El área de trabajo muestra el cambio de tamaño de cada archivo para que decidas por imagen.",
			tip: "Cada recodificación JPG acumula artefactos: trabaja desde los originales si planeas varias pasadas. 70–85 sirve para la mayoría de fotos; más bajo solo para miniaturas.",
			faqs: [
				{
					q: "¿Cuánto encogerán mis JPG?",
					a: "Entre un 30 y un 60 % con ajustes moderados, según cómo se guardó el original. El área de trabajo informa de las cifras reales.",
				},
				{
					q: "¿Comprimir pierde calidad?",
					a: "Sí, y de forma permanente. Inspecciona el texto fino y los bordes a tamaño completo antes de sustituir un original por una copia menor.",
				},
				{
					q: "¿Cambia la resolución?",
					a: "No. La compresión solo cambia con qué agresividad se codifican los píxeles; las dimensiones quedan exactamente iguales.",
				},
			],
		},
		"mp3-compressor": {
			title: "Compresor de MP3",
			intro: "Reduce archivos MP3 localmente recodificándolos a una tasa de bits menor. Notas de voz y pódcast caben en cualquier sitio.",
			detail: "Elige una tasa de bits menor en los ajustes de conversión —128 kbps o menos para voz, 192 kbps para música cómoda— y el área de trabajo informa del nuevo tamaño de cada archivo. El audio se decodifica y recodifica: elige la tasa más baja que aún te suene bien.",
			tip: "La recodificación no puede restaurar lo que el primer MP3 descartó, y apilar codificaciones añade artefactos. Para ahorros grandes y permanentes, recodifica desde originales sin pérdida cuando los tengas.",
			faqs: [
				{
					q: "¿Cuánto encogerán mis MP3?",
					a: "De 320 a 128 kbps se recorta alrededor del 60 % del tamaño; la voz a 64 kbps encoge mucho más. El área de trabajo muestra el resultado exacto.",
				},
				{
					q: "¿Qué tasa de bits elijo?",
					a: "128 kbps es un valor sólido por defecto, 96 o 64 kbps sirven para voz, y 192 kbps o más mantiene la música cómoda.",
				},
				{
					q: "¿Comprimir daña el sonido?",
					a: "Las tasas de bits bajas añaden artefactos, y recodificar un MP3 apila su compresión existente. Prueba un archivo por tipo de contenido antes de procesar una biblioteca.",
				},
			],
		},
		"ico-converter": {
			title: "Convertidor de ICO",
			intro: "Convierte iconos a ICO y desde ICO en tu navegador. Favicons e iconos de Windows, sin software de diseño ni subidas.",
			detail: "ICO empaqueta un icono para navegadores y Windows. Convierte PNG o JPG a ICO para favicons, o decodifica un ICO existente a PNG para verlo y reutilizarlo: todas las herramientas de abajo funcionan localmente en tu navegador.",
			tip: "Parte de fuentes cuadradas y de alta resolución para tamaños pequeños nítidos. La transparencia se conserva desde fuentes PNG; los iconos JPG llevan un fondo aplanado.",
			faqs: [
				{
					q: "¿Para qué sirve el formato ICO?",
					a: "Para favicons de navegador e iconos de aplicaciones de Windows: guarda una imagen en el contenedor exacto que esos sistemas esperan.",
				},
				{
					q: "¿Produce archivos ICO multip tamaño?",
					a: "Cada conversión produce un icono de un solo tamaño. Los equipos que necesitan paquetes multirresolución suelen generar los tamaños y combinarlos en su flujo de build.",
				},
				{
					q: "¿Las conversiones son gratis y privadas?",
					a: "Las dos cosas. Todas las herramientas enlazadas aquí son gratuitas, no piden cuenta y procesan las imágenes en tu navegador, no en un servidor.",
				},
			],
		},
		"audio-extractor": {
			title: "Extractor de audio",
			hubFromTitle: "Extrae audio de cualquier vídeo",
			intro: "Extrae audio de cualquier vídeo en tu navegador. MP4, WebM, MOV, MKV, AVI y más, a MP3 o WAV, sin subir nada.",
			detail: "Elige tu formato de vídeo abajo y el área de trabajo se abre con esa conversión preseleccionada: MP4, WebM, MOV, MKV, AVI, WMV o FLV a MP3, o WAV sin comprimir para editar. Solo se decodifica el flujo de audio y tus vídeos se quedan en el dispositivo.",
			tip: "El audio extraído hereda el techo de calidad de la fuente: la extracción no puede mejorarlo. Elige WAV cuando el audio vaya a edición; MP3 para escuchar y compartir.",
			faqs: [
				{
					q: "¿Qué formatos de vídeo se admiten?",
					a: "MP4 y M4V, WebM, MOV, MKV, AVI, WMV y FLV. Cada uno tiene una página dedicada con orientación específica.",
				},
				{
					q: "¿Qué pista de audio se extrae?",
					a: "La primera pista de audio del archivo. En archivos con comentarios o pistas alternativas, comprueba un resultado antes de convertir por lotes.",
				},
				{
					q: "¿Hasta qué vídeo puedo extraer?",
					a: "El techo lo marca la memoria del navegador: el búfer se agota justo por debajo de 2 GiB. Las grabaciones largas en equipos con poca RAM pueden fallar.",
				},
			],
		},
	},
};
