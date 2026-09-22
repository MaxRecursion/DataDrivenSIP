/**
 * The one door ApexCharts comes through.
 *
 * Apex is about 250 KB gzipped, more than the rest of the app put together, so it is only ever
 * reached by a dynamic `import()` inside an effect. Every chart file that uses this one is
 * itself lazy, and lives inside a disclosure section that Radix doesn't render until a reader
 * opens it — so a page nobody opens a section on never downloads a byte of it. `.size-limit.cjs`'s
 * "Initial JavaScript" check is what fails the build if that ever stops being true.
 *
 * `apexcharts/core` plus only the two chart types used here, rather than the batteries-included
 * default export: measured smaller, and nothing here needs Apex's legend, toolbar or exports.
 *
 * Motion: every animation Apex offers is off. Its default entrance draws paths by animating
 * their geometry, which is neither transform nor opacity (CLAUDE.md), and a chart that appears
 * at once when a section opens is faster to read anyway.
 */
import { useEffect, useRef } from "react";
import { useRootScale } from "../../lib/use-wide";
import type { ApexOptions } from "apexcharts";

/**
 * Apex's types say `export =` (CommonJS shape), while the ESM build a bundler actually loads
 * hands the class over as `default`. The type is the class; the loader below accepts either.
 */
type ApexClass = typeof import("apexcharts");

let loading: Promise<ApexClass> | null = null;

/** Loaded once per page, shared by every chart on it. */
function loadApex(): Promise<ApexClass> {
  loading ??= Promise.all([
    import("apexcharts/core"),
    import("apexcharts/bar"),
    import("apexcharts/radialBar"),
  ]).then(([core]) => (core as unknown as { default?: ApexClass }).default ?? (core as unknown as ApexClass));
  return loading;
}

/** The brand tokens, read from the stylesheet rather than repeating the hex here. */
export type Palette = {
  teal: string;
  marigold: string;
  loss: string;
  line: string;
  mute: string;
  ink: string;
  raised: string;
};

function palette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    teal: read("--teal", "#0e7c7b"),
    marigold: read("--marigold", "#f2a71b"),
    loss: read("--loss", "#d93025"),
    line: read("--line", "#d6dbe4"),
    mute: read("--mute-text", "#626b80"),
    ink: read("--ink", "#17203a"),
    raised: read("--raised", "#ffffff"),
  };
}

/** What every chart here shares: the brand font, and nothing that moves or offers to. */
function withBase(options: ApexOptions, height: number): ApexOptions {
  return {
    ...options,
    chart: {
      ...options.chart,
      height,
      fontFamily: "Satoshi, system-ui, sans-serif",
      animations: { enabled: false },
      toolbar: { show: false },
      zoom: { enabled: false },
      parentHeightOffset: 0,
    },
    states: {
      hover: { filter: { type: "none" } },
      active: { filter: { type: "none" } },
    },
  };
}

type ApexChartProps = {
  /**
   * Builds the options once the palette can be read, which is only after mount. `scale` is the
   * large-screen multiplier (useRootScale) for anything the options size in pixels.
   */
  build: (palette: Palette, scale: number) => ApexOptions;
  /** Rebuild when this changes; the caller's fund and answer, flattened to a string. */
  version: string;
  /** Reserved up front, so opening a section doesn't shift what's under it (CLS 0). */
  height: number;
};

export function ApexChart({ build, version, height: baseHeight }: ApexChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const scale = useRootScale();
  const height = Math.round(baseHeight * scale);
  // The latest builder, without making every render a reason to rebuild the chart.
  const builder = useRef(build);
  builder.current = build;

  useEffect(() => {
    let cancelled = false;
    let chart: InstanceType<ApexClass> | null = null;

    void loadApex().then((Apex) => {
      const element = host.current;
      if (cancelled || !element) return;
      chart = new Apex(element, withBase(builder.current(palette(), scale), height));
      void chart.render();
    });

    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [version, height, scale]);

  return <div ref={host} aria-hidden="true" style={{ height }} />;
}
