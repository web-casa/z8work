# Z8.Work reviewer notes — local draft

Do not submit until R5 candidate and R6 native acceptance is complete.

1. Install the exact candidate identified in readiness evidence. No account or automatic conversion-server connection is required.
2. Select generated PNG/JPEG/HEIC fixtures and an empty writable output folder. Try PNG, JPEG, WebP and AVIF output and compare saved sizes. Test quality presets; do not expect every output to be smaller.
3. Exercise a save failure in an isolated output folder. If Retry save is offered, choose another folder and verify the retained result saves without re-encoding, including when the input path is unavailable. Save before exiting; retained results are session-only and expire after 30 idle minutes (256 MiB per file, 1 GiB total).
4. Export a multi-page PDF. Cancel after a page is saved, reload the interface, then retry unfinished pages with the same input, settings and output folder. Confirm existing results remain intact.
5. Convert an audio fixture, extract audio from a supported video, and extract TXT from Markdown/DOCX. OCR, spreadsheets and video output are out of scope.
6. Restart the app and confirm history is visible but source/output access must be granted again. Cancel a picker and test a denied output location.
7. Clear the queue and confirm source and saved output files remain. History migration backups are separately retained. Test upgrade and uninstall on the installed package.

## Windows / MSIX

The planned full-trust desktop process manages native conversion subprocesses and user-selected file IO; this is not a request for administrator elevation. Confirm the actual package capability declaration. Verify WebView2 present/missing and offline behavior; no WebView2 distribution path has been certified here. Inspect the actual exe/DLL and identity evidence; use the Windows candidate's screenshots. No internal updater exists.

## Snap

Use the actual strict amd64 candidate. Check portal/home, hidden files and output-folder grants separately. Removable-media connection is not assumed. Developer mode and the Phase 3 ARM64 tarball do not demonstrate strict confinement. Verify update/rollback and package-manager data retention.

## Contact

contact@web.casa — provide redacted errors and generated fixtures. Privacy and support links are in the locale listing; deploy and verify their exact content before submission.
