import { describe, it, before, after } from "node:test"
import * as assert from "node:assert/strict"
import { checkWorldConflict } from "@/lib/world-conflict"
import type { WorldCollectionData } from "@/lib/narrative-world-store"

describe("phase-105 world conflict detection", () => {
  before(() => {
    process.env.FEATURE_PHASE_105 = "1"
  })
  after(() => {
    process.env.FEATURE_PHASE_105 = ""
  })

  const world: WorldCollectionData = {
    world_name: "Aetherfall",
    world_prompt: "A drifting sky-realm.",
    created_at: 1,
    version: 3,
  }

  it("no conflict when world does not exist yet", () => {
    const res = checkWorldConflict(null, 0)
    assert.equal(res.conflict, false)
  })

  it("no conflict when client omits expected_version (legacy callers)", () => {
    const res = checkWorldConflict(world, undefined)
    assert.equal(res.conflict, false)
  })

  it("no conflict when client version matches server version", () => {
    const res = checkWorldConflict(world, 3)
    assert.equal(res.conflict, false)
  })

  it("reports a conflict when client version is stale", () => {
    const res = checkWorldConflict(world, 2)
    assert.equal(res.conflict, true)
    if (res.conflict) {
      assert.equal(res.serverVersion, 3)
      assert.equal(res.clientVersion, 2)
      assert.equal(res.current.world_name, "Aetherfall")
    }
  })

  it("never reports a conflict when the flag is off", () => {
    process.env.FEATURE_PHASE_105 = "0"
    const res = checkWorldConflict(world, 2)
    assert.equal(res.conflict, false)
    process.env.FEATURE_PHASE_105 = "1"
  })
})
