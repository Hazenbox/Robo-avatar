import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ZoroAvatar } from "../src/react";

describe("<ZoroAvatar>", () => {
  test("renders a sized canvas, hidden from screen readers unless it has a label", () => {
    const decorative = renderToStaticMarkup(<ZoroAvatar size={96} />);
    expect(decorative).toContain("<canvas");
    expect(decorative).toContain("width:96px");
    expect(decorative).toContain('aria-hidden="true"');
    const labelled = renderToStaticMarkup(<ZoroAvatar size={96} label="Zoro, the assistant" />);
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Zoro, the assistant"');
    expect(labelled).not.toContain("aria-hidden");
  });
});
