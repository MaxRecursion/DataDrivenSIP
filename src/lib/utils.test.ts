import { describe, expect, it } from "vitest";
import { cn } from "./utils";

// PLAN.md D18: cn/lite only joins classes. It doesn't resolve Tailwind conflicts, so a
// component must never override one of its own default utilities through `className`.
describe("cn (cn/lite)", () => {
  it("joins truthy class names", () => {
    expect(cn("p-4", false, undefined, null, "text-ink")).toBe("p-4 text-ink");
  });

  it("keeps conflicting utilities instead of merging them", () => {
    expect(cn("px-2", "px-3")).toBe("px-2 px-3");
  });
});
