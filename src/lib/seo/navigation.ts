import { getLocale } from "$lib/paraglide/runtime";
import { localePath } from "./routes.mjs";

export function localHref(path: string): string {
	return localePath(path, getLocale());
}
