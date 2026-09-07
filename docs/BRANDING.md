# Z8.Work

The production site name is **Z8.Work**, with canonical origin **https://z8.work/**.

`src/lib/util/consts.ts` defines the shared name, origin and default download filename template. `PUB_HOSTNAME` is a legacy upstream setting; changing it alone does not change canonical URLs. Local and nightly builds retain their environment suffix in the browser title.

The header, translations, page titles, social metadata, sitemap, robots file, PWA manifest and Apple web app metadata use the current branding. New favicon, install icons and social card assets live in `static/brand/`. The icon uses a Z8 pixel mark within the maskable safe area. Regenerate these assets with:

```sh
node scripts/generate-brand-assets.mjs
```

The generator uses the installed Playwright browser and bundled fonts, with no external asset requests. Set `CHROMIUM_PATH` to use a system Chromium executable.

New downloads use `Z8.Work_%name%`. Only the exact former defaults `VERT_%name%` and `ii.Pe_%name%` are migrated; custom filename templates are preserved. The migrated default is also persisted so downloads and settings agree.

The public contact email is **contact@web.casa**, configured through `CONTACT_EMAIL`. Historical ii.Pe/VERT design records, screenshots and upstream acknowledgements retain their original names.

The Simplified Chinese header tagline is **本地多文件转换处理工具**, with corresponding English, Spanish and Traditional Chinese text. The top-right language selector uses the existing 15-locale store, saves the selection and restores keyboard focus after the translated layout remounts. Files, target formats and conversion results remain in the queue when switching languages.

“Remove all files” appears at the top of the queue with a contrasting border, trash icon and file count. It remains disabled during processing. Clearing the queue uses the shared resource-cleanup path and returns keyboard focus to Add Files. On narrow screens, the queue title and count share a two-column layout with the clear button to retain space for file rows.

These changes prepare the application for the new production domain. DNS, TLS certificates and the production deployment are managed separately.

Validation on 2026-09-07: production build, Svelte typecheck (0 errors / 0 warnings), all 163 unit tests, changed-file formatting/ESLint, and all 10 browser regression groups passed. A separate browser check verified canonical and social URLs, install icon availability, all 15 locales at a 320px viewport without horizontal overflow, and migration of both legacy defaults while preserving a custom template and unrelated settings.

The subsequent header and clear-button update passed all 10 browser regression groups, typecheck and changed-file lint. Additional checks covered 150 combinations of 15 languages, light/dark themes and 320/390/768/1100/1366px widths, plus language persistence, keyboard controls, preserving completed and running conversions, and the contact email link. The 390px queue regression still verifies that the identities and metadata of three HEIC files fit above the fixed action bar.
