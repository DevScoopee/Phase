import { describe, it, beforeEach, mock } from "node:test"
import * as assert from "node:assert/strict"
import { fetchWithIpfsFallback, resolveIpfsFallbackConfig } from "@/lib/phase-nft-metadata-build"

describe("phase-123 ipfs fallback", () => {
  it("resolves config with defaults", () => {
    const cfg = resolveIpfsFallbackConfig({})
    assert.ok(cfg.gateways.length > 0)
    assert.ok(cfg.timeoutMs >= 500)
  })

  it("validates empty ipfs path", async () => {
    const res = await fetchWithIpfsFallback("", { config: { timeoutMs: 500 } })
    assert.equal(res.ok, false)
  })

  it("falls back across gateways on failure", async () => {
    const origFetch = global.fetch
    let calls = 0
    // @ts-ignore mock
    global.fetch = async () => {
      calls++
      throw new Error("network fail")
    }
    const res = await fetchWithIpfsFallback("QmTest", { config: { gateways: ["https://a.test/ipfs", "https://b.test/ipfs"], timeoutMs: 200 } })
    assert.equal(res.ok, false)
    if (!res.ok) assert.equal(res.perGateway.length, 2)
    assert.equal(calls, 2)
    global.fetch = origFetch
  })

  it("returns first successful gateway", async () => {
    const origFetch = global.fetch
    // @ts-ignore mock
    global.fetch = async (url: string | URL | Request) => {
      if (String(url).includes("a.test")) throw new Error("fail")
      return new Response(new ArrayBuffer(4), { status: 200, headers: { "content-type": "image/png" } })
    }
    const res = await fetchWithIpfsFallback("QmOk", { config: { gateways: ["https://a.test/ipfs", "https://b.test/ipfs"], timeoutMs: 500 } })
    assert.equal(res.ok, true)
    if (res.ok) assert.ok(res.gateway.includes("b.test"))
    global.fetch = origFetch
  })
})
