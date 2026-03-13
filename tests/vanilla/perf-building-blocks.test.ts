import { describe, it } from 'vitest'
import { atom, createStore } from 'jotai'

describe('building blocks cache performance', () => {
  it('benchmarks store.set with 2000+ derived atoms in a tree', () => {
    // Build a tree of 2000+ derived atoms: a chain of depth 500,
    // with 4 fan-out branches at each of 500 levels = 2500 total derived atoms.
    const DEPTH = 500
    const FANOUT = 4
    const ITERATIONS = 100

    const rootAtom = atom(0)

    // Build the spine chain
    const spine: ReturnType<typeof atom>[] = [rootAtom]
    const allLeaves: ReturnType<typeof atom>[] = []

    for (let i = 1; i <= DEPTH; i++) {
      const prev = spine[i - 1]!
      const spineAtom = atom((get) => get(prev) + 1)
      spine.push(spineAtom)

      // Fan out from each spine atom
      for (let j = 0; j < FANOUT - 1; j++) {
        const leaf = atom((get) => get(spineAtom) + j)
        allLeaves.push(leaf)
      }
    }

    const totalAtoms = DEPTH + allLeaves.length
    const store = createStore()

    // Subscribe to the deepest spine atom and some leaves so atoms are mounted
    const leafAtom = spine[DEPTH]!
    const unsubs: (() => void)[] = []
    unsubs.push(store.sub(leafAtom, () => {}))
    // Mount all fan-out leaves
    for (const leaf of allLeaves) {
      unsubs.push(store.sub(leaf, () => {}))
    }

    // Warm up
    store.set(rootAtom, 1)
    store.get(leafAtom)

    // Benchmark store.set on the root atom
    const times: number[] = []
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now()
      store.set(rootAtom, i + 2)
      const end = performance.now()
      times.push(end - start)
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const sorted = [...times].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]!
    const min = sorted[0]!
    const max = sorted[sorted.length - 1]!
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!

    console.log(`\n=== Building Blocks Cache Benchmark (Mounted Tree) ===`)
    console.log(`Total derived atoms: ${totalAtoms} (depth=${DEPTH}, fanout=${FANOUT})`)
    console.log(`Iterations: ${ITERATIONS}`)
    console.log(`Average: ${avg.toFixed(3)} ms`)
    console.log(`Median:  ${median.toFixed(3)} ms`)
    console.log(`Min:     ${min.toFixed(3)} ms`)
    console.log(`Max:     ${max.toFixed(3)} ms`)
    console.log(`P95:     ${p95.toFixed(3)} ms`)
    console.log(`=====================================================\n`)

    unsubs.forEach((fn) => fn())
  })

  it('benchmarks store.get on unmounted tree of 2000+ derived atoms', () => {
    const DEPTH = 500
    const FANOUT = 4
    const ITERATIONS = 100

    const rootAtom = atom(0)

    // Build the spine chain with fan-out
    const spine: ReturnType<typeof atom>[] = [rootAtom]
    const allLeaves: ReturnType<typeof atom>[] = []

    for (let i = 1; i <= DEPTH; i++) {
      const prev = spine[i - 1]!
      const spineAtom = atom((get) => get(prev) + 1)
      spine.push(spineAtom)

      for (let j = 0; j < FANOUT - 1; j++) {
        const leaf = atom((get) => get(spineAtom) + j)
        allLeaves.push(leaf)
      }
    }

    const totalAtoms = DEPTH + allLeaves.length
    const store = createStore()
    const leafAtom = spine[DEPTH]!

    // Warm up - read all atoms once
    store.get(leafAtom)
    for (const leaf of allLeaves) {
      store.get(leaf)
    }

    // Benchmark store.get on the leaf (unmounted, forces full dependency walk)
    const times: number[] = []
    for (let i = 0; i < ITERATIONS; i++) {
      // Mutate root to invalidate caches
      store.set(rootAtom, i + 1)
      const start = performance.now()
      store.get(leafAtom)
      // Also read some fan-out leaves to exercise the building blocks cache
      for (let j = 0; j < allLeaves.length; j += 10) {
        store.get(allLeaves[j]!)
      }
      const end = performance.now()
      times.push(end - start)
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const sorted = [...times].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]!
    const min = sorted[0]!
    const max = sorted[sorted.length - 1]!
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!

    console.log(`\n=== Unmounted Read Benchmark (Tree) ===`)
    console.log(`Total derived atoms: ${totalAtoms} (depth=${DEPTH}, fanout=${FANOUT})`)
    console.log(`Iterations: ${ITERATIONS}`)
    console.log(`Average: ${avg.toFixed(3)} ms`)
    console.log(`Median:  ${median.toFixed(3)} ms`)
    console.log(`Min:     ${min.toFixed(3)} ms`)
    console.log(`Max:     ${max.toFixed(3)} ms`)
    console.log(`P95:     ${p95.toFixed(3)} ms`)
    console.log(`=======================================\n`)
  })
})
