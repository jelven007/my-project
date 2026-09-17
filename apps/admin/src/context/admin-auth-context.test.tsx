import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../app.js";
import { renderAdmin } from "../test/render.js";

describe("AdminAuthProvider bootstrap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows login immediately when no admin session cookie exists", async () => {
    const fetchMock = vi.fn(
      () => new Promise<Response>(() => undefined),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderAdmin(<App />);

    expect(await screen.findByLabelText("用户名或邮箱")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
