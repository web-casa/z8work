import type { SeoCopy } from "$lib/seo/copy-types";
import { en } from "$lib/seo/copy/en";
import { es } from "$lib/seo/copy/es";
import { zhHans } from "$lib/seo/copy/zh-Hans";
import { zhHant } from "$lib/seo/copy/zh-Hant";

export const content: Record<string, SeoCopy> = {
	en,
	es,
	"zh-Hans": zhHans,
	"zh-Hant": zhHant,
};

export function seoCopy(locale: string): SeoCopy {
	return content[locale] ?? content.en;
}
