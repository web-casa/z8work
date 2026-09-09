// Build and validation inputs, shared by the receipt and CI coverage check.
// This is an explicit source allowlist, not a recursive working-directory archive.
export const inputPaths = [
	"desktop",
	"src",
	"src-tauri",
	"scripts",
	"tests",
	"packaging/desktop",
	"package.json",
	"bun.lock",
	"postcss.config.js",
	"tailwind.config.ts",
	"tsconfig.json",
	"rust-toolchain.toml",
	"eslint.config.js",
	".prettierrc",
	".prettierignore",
	".gitignore",
	".gitattributes",
	".github/workflows/desktop.yml",
];
