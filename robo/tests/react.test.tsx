import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { RoboAvatar } from "../src/react";

describe("<RoboAvatar>", () => {
  test("renders a sized canvas, hidden from screen readers unless it has a label", () => {
    const decorative = renderToStaticMarkup(<RoboAvatar size={96} />);
    expect(decorative).toContain("<canvas");
    expect(decorative).toContain("width:96px");
    expect(decorative).toContain('aria-hidden="true"');
    const labelled = renderToStaticMarkup(<RoboAvatar size={96} label="Robo, the assistant" />);
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Robo, the assistant"');
    expect(labelled).not.toContain("aria-hidden");
  });
});
