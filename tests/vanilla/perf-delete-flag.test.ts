import { describe, it } from 'vitest'
import { atom, createStore } from 'jotai'

describe('perf: delete vs flag for atomState property clearing', () => {
  it(
    'measures property access performance when cycling between error and success states',
    () => {
      const NUM_ATOMS = 500
      const CYCLES = 50
      const ACCESS_ITERATIONS = 1000

      const store = createStore()

      // Create atoms that can cycle between error and success states
      const toggleAtom = atom(false)
      const atoms = Array.from({ length: NUM_ATOMS }, (_, i) =>
        atom((get) => {
          if (get(toggleAtom)) {
            throw new Error(`error-${i}`)
          }
          return i
        }),
      )

      // Initialize all atoms
      for (const a of atoms) {
        try {
          store.get(a)
        } catch {
          // ignore errors
        }
      }

      // Cycle atoms between error and success states
      for (let cycle = 0; cycle < CYCLES; cycle++) {
        // Set to error state
        store.set(toggleAtom, true)
        for (const a of atoms) {
          try {
            store.get(a)
          } catch {
            // expected
          }
        }
        // Set back to success state
        store.set(toggleAtom, false)
        for (const a of atoms) {
          store.get(a)
        }
      }

      // Now measure property access performance after many cycles
      // With delete-based approach, objects would be in dictionary mode by now
      // With flag-based approach, objects stay in fast mode
      const accessStart = performance.now()
      for (let i = 0; i < ACCESS_ITERATIONS; i++) {
        for (const a of atoms) {
          store.get(a)
        }
      }
      const accessEnd = performance.now()
      const accessTime = accessEnd - accessStart

      // Also measure a baseline: atoms that never had errors
      const store2 = createStore()
      const baselineAtoms = Array.from({ length: NUM_ATOMS }, (_, i) =>
        atom(() => i),
      )
      for (const a of baselineAtoms) {
        store2.get(a)
      }

      const baselineStart = performance.now()
      for (let i = 0; i < ACCESS_ITERATIONS; i++) {
        for (const a of baselineAtoms) {
          store2.get(a)
        }
      }
      const baselineEnd = performance.now()
      const baselineTime = baselineEnd - baselineStart

      const ratio = accessTime / baselineTime

      console.log('--- perf-delete-flag benchmark ---')
      console.log(
        `Atoms: ${NUM_ATOMS}, Cycles: ${CYCLES}, Access iterations: ${ACCESS_ITERATIONS}`,
      )
      console.log(
        `After error cycling: ${accessTime.toFixed(2)}ms (${(accessTime / ACCESS_ITERATIONS).toFixed(4)}ms/iter)`,
      )
      console.log(
        `Baseline (no errors): ${baselineTime.toFixed(2)}ms (${(baselineTime / ACCESS_ITERATIONS).toFixed(4)}ms/iter)`,
      )
      console.log(`Ratio (cycled/baseline): ${ratio.toFixed(3)}x`)
      console.log(
        `A ratio close to 1.0 means flag-based clearing keeps V8 fast-mode properties.`,
      )
      console.log(
        `A ratio >> 1.0 would indicate dictionary-mode degradation (delete-based).`,
      )
      console.log('--- end benchmark ---')
    },
    60_000,
  )
})
