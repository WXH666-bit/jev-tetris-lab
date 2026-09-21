import { describe, it, expect, vi } from "vitest";
import type { LookupAddress } from "node:dns";
import { validateEndpoint } from "../backend/src/services/transport";

const dnsLookup = vi.hoisted(() => vi.fn<() => Promise<LookupAddress[]>>());
vi.mock("node:dns/promises", () => ({ lookup: dnsLookup }));

describe("validated DNS address selection", () => {
  it("uses IPv4 when DNS returns IPv6 first", async () => {
    dnsLookup.mockResolvedValue([
      { address: "2606:4700::6812:273", family: 6 },
      { address: "104.18.2.115", family: 4 },
    ]);
    expect((await validateEndpoint("https://openrouter.ai/")).record.family).toBe(4);
  });
  it("retains IPv6-only public endpoints", async () => {
    dnsLookup.mockResolvedValue([{address:"2606:4700::6812:273",family:6}]);
    expect((await validateEndpoint("https://openrouter.ai/")).record.family).toBe(6);
  });
  it("still rejects mixed public/private DNS responses before selection", async () => {
    dnsLookup.mockResolvedValue([
      {address:"104.18.2.115",family:4},
      {address:"::1",family:6},
    ]);
    await expect(validateEndpoint("https://openrouter.ai/")).rejects.toThrow("禁止访问");
  });
});
