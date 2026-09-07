import { PUB_DISABLE_ALL_EXTERNAL_REQUESTS, PUB_ENV } from "$env/static/public";

export const GITHUB_URL_VERT = "https://github.com/VERT-sh/VERT";
export const GITHUB_URL_VERTD = "https://github.com/VERT-sh/vertd";
export const GITHUB_API_URL = "https://api.github.com/repos/VERT-sh/VERT";
export const DISCORD_URL = "https://discord.gg/kqevGxYPak";
export const SITE_NAME = "Z8.Work";
export const SITE_URL = "https://z8.work/";
export const DEFAULT_FILENAME_FORMAT = `${SITE_NAME}_%name%`;
export const VERT_NAME =
	PUB_ENV === "development"
		? `${SITE_NAME} Local`
		: PUB_ENV === "nightly"
			? `${SITE_NAME} Nightly`
			: SITE_NAME;
export const CONTACT_EMAIL = "contact@web.casa";

// i'm not entirely sure this should be in consts.ts, but it is technically a constant as .env is static for VERT
export const DISABLE_ALL_EXTERNAL_REQUESTS =
	PUB_DISABLE_ALL_EXTERNAL_REQUESTS === "true";

export const GB = 1024 * 1024 * 1024;
