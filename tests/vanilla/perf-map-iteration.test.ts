import { describe, it } from 'vitest'
import { atom, createStore } from 'jotai'

describe('perf: Map iteration in dependency checks', () => {
  it(
    'benchmarks store.get with many dependencies (unmounted atoms)',
    () => {
      const store = createStore()
      const NUM_BASE_ATOMS = 50
      const NUM_DERIVED = 20
      const ITERATIONS = 5000

      // Create base primitive atoms
      const baseAtoms = Array.from({ length: NUM_BASE_ATOMS }, (_, i) =>
        atom(i),
      )

      // Create derived atoms that depend on all base atoms
      // This exercises the dependency map iteration in readAtomState
      const derivedAtoms = Array.from({ length: NUM_DERIVED }, () =>
        atom((get) => {
          let sum = 0
          for (const base of baseAtoms) {
            sum += get(base)
          }
          return sum
        }),
      )

      // Warm up
      for (const d of derivedAtoms) {
        store.get(d)
      }

      // Benchmark repeated store.get on unmounted derived atoms
      const startGet = performance.now()
      for (let i = 0; i < ITERATIONS; i++) {
        for (const d of derivedAtoms) {
          store.get(d)
        }
      }
      const endGet = performance.now()
      const getMs = endGet - startGet

      console.log(
        `store.get (unmounted, ${NUM_DERIVED} derived x ${NUM_BASE_ATOMS} deps, ${ITERATIONS} iters): ${getMs.toFixed(2)}ms`,
      )

      // Benchmark store.set followed by store.get to measure dep-check after mutation
      const SET_ITERATIONS = 500
      const startSetGet = performance.now()
      for (let i = 0; i < SET_ITERATIONS; i++) {
        store.set(baseAtoms[i % NUM_BASE_ATOMS]!, i)
        for (const d of derivedAtoms) {
          store.get(d)
        }
      }
      const endSetGet = performance.now()
      const setGetMs = endSetGet - startSetGet

      console.log(
        `store.set+get (unmounted, ${NUM_DERIVED} derived x ${NUM_BASE_ATOMS} deps, ${SET_ITERATIONS} iters): ${setGetMs.toFixed(2)}ms`,
      )

      // Benchmark with mounted atoms (subscribed)
      const mountedStore = createStore()
      const mountedBaseAtoms = Array.from({ length: NUM_BASE_ATOMS }, (_, i) =>
        atom(i),
      )
      const mountedDerivedAtoms = Array.from({ length: NUM_DERIVED }, () =>
        atom((get) => {
          let sum = 0
          for (const base of mountedBaseAtoms) {
            sum += get(base)
          }
          return sum
        }),
      )

      // Subscribe to mount atoms
      const unsubs = mountedDerivedAtoms.map((d) =>
        mountedStore.sub(d, () => {}),
      )

      const MOUNTED_SET_ITERATIONS = 500
      const startMounted = performance.now()
      for (let i = 0; i < MOUNTED_SET_ITERATIONS; i++) {
        mountedStore.set(mountedBaseAtoms[i % NUM_BASE_ATOMS]!, i)
      }
      const endMounted = performance.now()
      const mountedMs = endMounted - startMounted

      console.log(
        `store.set (mounted, ${NUM_DERIVED} derived x ${NUM_BASE_ATOMS} deps, ${MOUNTED_SET_ITERATIONS} iters): ${mountedMs.toFixed(2)}ms`,
      )

      // Cleanup
      unsubs.forEach((u) => u())
    },
    30000,
  )
})
