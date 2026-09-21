/**
 * Assembles `.ci-public/`, the `publicDir` Vite serves from under `--mode ci` (PLAN.md §10):
 * `_headers` and `fonts` copied straight from the real `public/`, `data` swapped for the frozen
 * set in `e2e/fixtures/data`.
 *
 * Never touches `public/data` itself — that directory is git-tracked, real, nightly-updated
 * data, and building a copy elsewhere is the whole point: a CI build must not depend on what
 * last night's pipeline run happened to publish, so an unrelated PR can't fail on data drift.
 *
 * Run before `vite build --mode ci`, after `fonts:fetch` has already populated `public/fonts`.
 */
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const staging = join(root, ".ci-public");

async function main(): Promise<void> {
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });

  await cp(join(root, "public/_headers"), join(staging, "_headers"));

  const fonts = await readdir(join(root, "public/fonts")).catch(() => null);
  if (!fonts || fonts.length === 0) {
    throw new Error("ci-public-dir: public/fonts is empty — run `pnpm fonts:fetch` first");
  }
  await cp(join(root, "public/fonts"), join(staging, "fonts"), { recursive: true });

  await cp(join(root, "e2e/fixtures/data"), join(staging, "data"), { recursive: true });

  console.log(`assembled ${staging} from e2e/fixtures/data`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
