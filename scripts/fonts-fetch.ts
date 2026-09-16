/**
 * Downloads the Fontshare fonts at build time and checks them against pinned hashes.
 *
 * The ITF Free Font License 2.0 lets us self-host Fontshare's woff2 files. It forbids
 * modifying them (subsetting included) and redistributing them through a public
 * repository. So they are fetched unmodified, live only in the build output, and are
 * gitignored (PLAN.md D14).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export type FontPin = { file: string; url: string; sha256: string; bytes: number };
export type Fetcher = (url: string) => Promise<Response>;

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Fetches with exponential backoff on network errors, 429 and 5xx. Other statuses fail at once. */
export async function download(
  url: string,
  fetcher: Fetcher = fetch,
  retries = 3,
  baseDelayMs = 1000,
): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    try {
      const response = await fetcher(url);
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      lastError = new Error(`HTTP ${response.status}`);
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Couldn't download ${url}: ${String(lastError)}`);
}

export async function ensureFont(
  pin: FontPin,
  directory: string,
  fetcher: Fetcher = fetch,
  baseDelayMs = 1000,
): Promise<"cached" | "downloaded"> {
  const target = join(directory, pin.file);
  const existing = await readFile(target).catch(() => null);
  if (existing && sha256(existing) === pin.sha256) return "cached";

  const data = await download(pin.url, fetcher, 3, baseDelayMs);
  const actual = sha256(data);
  if (actual !== pin.sha256) {
    throw new Error(
      `${pin.file}: expected sha256 ${pin.sha256} but Fontshare served ${actual}. ` +
        "The upstream file changed. Review it, pin the new hash in scripts/fonts.json and " +
        "bump the /fonts/vN path. Never substitute a modified font.",
    );
  }
  await mkdir(directory, { recursive: true });
  await writeFile(target, data);
  return "downloaded";
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(new URL("./fonts.json", import.meta.url), "utf8")) as {
    directory: string;
    fonts: FontPin[];
  };
  for (const pin of manifest.fonts) {
    console.log(`${pin.file}: ${await ensureFont(pin, manifest.directory)}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
