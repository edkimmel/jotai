/**
 * Regression tests demonstrating redundant recursive traversal of unmounted
 * derived atoms on repeated store.get() calls.
 *
 * readAtomState walks the full dependency chain every time an unmounted derived
 * atom is read, even when no writes have occurred. The spy below wraps the
 * readAtomState building block so that every recursive call is counted.
 *
 * For a chain of depth N, a single store.get() that hits the cache should
 * call readAtomState O(1) times (or zero beyond the root). Currently it calls
 * it O(N) times on every read.
 */

import { describe, expect, it, vi } from 'vitest'
import { atom, createStore } from 'jotai/vanilla'
import {
  INTERNAL_buildStoreRev2 as buildStore,
  INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks,
} from 'jotai/vanilla/internals'

/** Wrap readAtomState (slot 14) with a spy and return both store and spy. */
const createSpiedStore = () => {
  const base = createStore()
  const bb = getBuildingBlocks(base)
  const realReadAtomState = bb[14]
  const spy = vi.fn(realReadAtomState)
  const store = buildStore(
    bb[0], bb[1], bb[2], bb[3], bb[4], bb[5], bb[6],
    bb[7], bb[8], bb[9], bb[10], bb[11], bb[12], bb[13],
    spy as typeof bb[14],  // slot 14: readAtomState
  )
  return { store, spy }
}

describe('redundant readAtomState traversal on unmounted atoms', () => {
  it('readAtomState is called for every node in a chain on each store.get()', () => {
    const { store, spy } = createSpiedStore()
    const base = atom(1)
    store.set(base, 1)

    const depth = 5
    let prev = base as ReturnType<typeof atom<number>>
    for (let i = 0; i < depth; i++) {
      const dep = prev
      prev = atom((get) => get(dep) + 1)
    }
    const tip = prev

    store.get(tip) // first read – traversal necessary, warms cache
    spy.mockClear()

    store.get(tip) // second read – nothing changed
    const callsOnSecondRead = spy.mock.calls.length

    // callsOnSecondRead should be 0 or 1 (just the entry call, no recursion).
    // Currently it is depth+1 because readAtomState recurses through every dep.
    expect(callsOnSecondRead).toBeLessThanOrEqual(1)
  })

  it('traversal count scales with chain depth, proving O(N) cost per read', () => {
    // For each depth, measure how many readAtomState calls a cache-warm read costs.
    // If caching worked, the count would be constant (0 or 1) regardless of depth.
    // The growing count demonstrates the O(N) traversal bug.
    const counts: number[] = []

    for (const depth of [5, 10, 20]) {
      const { store, spy } = createSpiedStore()
      const base = atom(0)

      let prev = base as ReturnType<typeof atom<number>>
      for (let i = 0; i < depth; i++) {
        const dep = prev
        prev = atom((get) => get(dep) + 1)
      }
      const tip = prev

      store.get(tip) // warm
      spy.mockClear()
      store.get(tip) // measure
      counts.push(spy.mock.calls.length)
    }

    // All counts should be the same small number (ideally ≤ 1).
    // Currently they grow with depth: [6, 11, 21] — proving O(N) traversal.
    expect(counts[0]).toBe(counts[1])
    expect(counts[1]).toBe(counts[2])
  })

  it('diamond: shared node is re-entered multiple times per store.get()', () => {
    //       base
    //      /    \
    //     l      r
    //      \    /
    //       top
    const { store, spy } = createSpiedStore()
    const base = atom(2)
    const shared = atom((get) => get(base) + 10)
    const l = atom((get) => get(shared) * 2)
    const r = atom((get) => get(shared) + 1)
    const top = atom((get) => get(l) + get(r))

    store.get(top) // warm
    spy.mockClear()

    store.get(top)
    const calls = spy.mock.calls.length

    // With caching, top is the only entry; no recursion needed: calls === 1.
    // Without it, the full graph (top→l→shared→base, top→r→shared→base) is
    // walked: calls > 1, and `shared` is visited twice.
    expect(calls).toBeLessThanOrEqual(1)
  })
})
