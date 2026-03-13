import { describe, it, expect } from 'vitest'
import { atom, createStore } from 'jotai'

describe('perf: closure allocation in readAtomState', () => {
  it('should efficiently recompute a large set of derived atoms on store.set', () => {
    // Use a fan-out pattern to create 2000+ derived atoms without deep recursion.
    // Root -> 50 intermediate atoms -> 40 leaves each = 2000+ derived atoms
    const FAN_OUT_1 = 50
    const FAN_OUT_2 = 40
    const TOTAL_DERIVED = FAN_OUT_1 + FAN_OUT_1 * FAN_OUT_2
    const ITERATIONS = 50

    const store = createStore()

    // Create root primitive atom
    const rootAtom = atom(0)

    // Level 1: intermediate atoms depending on root
    const level1: ReturnType<typeof atom>[] = []
    for (let i = 0; i < FAN_OUT_1; i++) {
      level1.push(atom((get) => get(rootAtom) + 1))
    }

    // Level 2: leaf atoms depending on level 1
    const level2: ReturnType<typeof atom>[] = []
    for (let i = 0; i < FAN_OUT_1; i++) {
      const parent = level1[i]!
      for (let j = 0; j < FAN_OUT_2; j++) {
        level2.push(atom((get) => get(parent) + 1))
      }
    }

    // Subscribe to all leaf atoms so all atoms are mounted
    for (const leafAtom of level2) {
      store.sub(leafAtom, () => {})
    }

    // Verify the chain works correctly
    expect(store.get(level2[0]!)).toBe(2)

    // Warm up
    for (let i = 0; i < 5; i++) {
      store.set(rootAtom, i + 1)
    }
    expect(store.get(level2[0]!)).toBe(7)

    // Benchmark: time store.set which triggers recomputation of all derived atoms
    const times: number[] = []
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now()
      store.set(rootAtom, i + 100)
      const elapsed = performance.now() - start
      times.push(elapsed)
    }

    // Verify correctness
    expect(store.get(level2[0]!)).toBe(100 + ITERATIONS - 1 + 2)

    // Compute statistics
    times.sort((a, b) => a - b)
    const median = times[Math.floor(times.length / 2)]!
    const avg = times.reduce((sum, t) => sum + t, 0) / times.length
    const min = times[0]!
    const max = times[times.length - 1]!
    const p95 = times[Math.floor(times.length * 0.95)]!

    console.log(
      `\n[Benchmark] Fan-out tree with ${TOTAL_DERIVED} derived atoms, ${ITERATIONS} iterations:`,
    )
    console.log(`  Median: ${median.toFixed(3)} ms`)
    console.log(`  Average: ${avg.toFixed(3)} ms`)
    console.log(`  Min: ${min.toFixed(3)} ms`)
    console.log(`  Max: ${max.toFixed(3)} ms`)
    console.log(`  P95: ${p95.toFixed(3)} ms`)

    // Sanity check: each store.set should complete in a reasonable time
    expect(median).toBeLessThan(500)
  })

  it('should efficiently recompute a wide dependency tree', () => {
    const WIDTH = 500
    const DEPTH = 5
    const ITERATIONS = 30

    const store = createStore()
    const rootAtom = atom(0)

    // Build a tree: root -> level1[WIDTH] -> level2[WIDTH] -> ...
    let currentLevel: ReturnType<typeof atom>[] = [rootAtom]
    for (let d = 0; d < DEPTH; d++) {
      const nextLevel: ReturnType<typeof atom>[] = []
      for (let w = 0; w < WIDTH; w++) {
        // Each atom in the next level depends on one atom from current level
        const parent = currentLevel[w % currentLevel.length]!
        nextLevel.push(atom((get) => get(parent) + 1))
      }
      currentLevel = nextLevel
    }

    // Subscribe to all leaf atoms so the tree is mounted
    for (const leafAtom of currentLevel) {
      store.sub(leafAtom, () => {})
    }

    // Verify
    expect(store.get(currentLevel[0]!)).toBe(DEPTH)

    // Warm up
    for (let i = 0; i < 3; i++) {
      store.set(rootAtom, i + 1)
    }

    // Benchmark
    const times: number[] = []
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now()
      store.set(rootAtom, i + 100)
      const elapsed = performance.now() - start
      times.push(elapsed)
    }

    times.sort((a, b) => a - b)
    const median = times[Math.floor(times.length / 2)]!
    const avg = times.reduce((sum, t) => sum + t, 0) / times.length
    const min = times[0]!
    const max = times[times.length - 1]!
    const p95 = times[Math.floor(times.length * 0.95)]!

    console.log(
      `\n[Benchmark] Wide tree: ${WIDTH} width x ${DEPTH} depth (${WIDTH * DEPTH} derived atoms), ${ITERATIONS} iterations:`,
    )
    console.log(`  Median: ${median.toFixed(3)} ms`)
    console.log(`  Average: ${avg.toFixed(3)} ms`)
    console.log(`  Min: ${min.toFixed(3)} ms`)
    console.log(`  Max: ${max.toFixed(3)} ms`)
    console.log(`  P95: ${p95.toFixed(3)} ms`)

    expect(median).toBeLessThan(500)
  })
})
