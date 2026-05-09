import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "./config/config.js";
import { imessageStartupWarning, selectIMessageAdapter } from "./imessage-adapter.js";

const blueOnly = (): OpenClawConfig => ({
  channels: {
    bluebubbles: { serverUrl: "http://example", password: "hunter2" },
  } as OpenClawConfig["channels"],
});

const legacyOnly = (): OpenClawConfig => ({
  channels: {
    imessage: { enabled: true, cliPath: "imsg" } as OpenClawConfig["channels"]["imessage"],
  } as OpenClawConfig["channels"],
});

const both = (): OpenClawConfig => ({
  channels: {
    bluebubbles: { serverUrl: "http://example", password: "hunter2" },
    imessage: { enabled: true, cliPath: "imsg" } as OpenClawConfig["channels"]["imessage"],
  } as OpenClawConfig["channels"],
});

const neither = (): OpenClawConfig => ({});

describe("selectIMessageAdapter (#59)", () => {
  it("returns the BlueBubbles adapter when BlueBubbles is configured", () => {
    const adapter = selectIMessageAdapter(blueOnly());
    expect(adapter?.backend).toBe("bluebubbles");
    expect(adapter?.deprecationWarning()).toBeNull();
  });

  it("returns the legacy adapter when only legacy iMessage is configured", () => {
    const adapter = selectIMessageAdapter(legacyOnly());
    expect(adapter?.backend).toBe("legacy-imsg");
    expect(adapter?.deprecationWarning()).toMatch(/deprecated/i);
    expect(adapter?.deprecationWarning()).toMatch(/bluebubbles/i);
  });

  it("prefers BlueBubbles over legacy when both are configured", () => {
    const adapter = selectIMessageAdapter(both());
    expect(adapter?.backend).toBe("bluebubbles");
    expect(adapter?.deprecationWarning()).toBeNull();
  });

  it("returns null when neither backend is configured", () => {
    expect(selectIMessageAdapter(neither())).toBeNull();
  });

  it("ignores BlueBubbles when serverUrl or password is missing", () => {
    const onlyUrl: OpenClawConfig = {
      channels: { bluebubbles: { serverUrl: "http://x" } } as OpenClawConfig["channels"],
    };
    expect(selectIMessageAdapter(onlyUrl)).toBeNull();
    const onlyPw: OpenClawConfig = {
      channels: { bluebubbles: { password: "x" } } as OpenClawConfig["channels"],
    };
    expect(selectIMessageAdapter(onlyPw)).toBeNull();
  });

  it("treats explicit channels.imessage.enabled === false as not configured", () => {
    const cfg: OpenClawConfig = {
      channels: {
        imessage: { enabled: false, cliPath: "imsg" } as OpenClawConfig["channels"]["imessage"],
      } as OpenClawConfig["channels"],
    };
    expect(selectIMessageAdapter(cfg)).toBeNull();
  });
});

describe("imessageStartupWarning (#59)", () => {
  it("returns a migration suggestion when the legacy backend is selected", () => {
    expect(imessageStartupWarning(legacyOnly())).toMatch(/migrate to channels\.bluebubbles/i);
  });

  it("returns null when BlueBubbles is selected", () => {
    expect(imessageStartupWarning(blueOnly())).toBeNull();
  });

  it("returns null when no backend is configured", () => {
    expect(imessageStartupWarning(neither())).toBeNull();
  });
});
