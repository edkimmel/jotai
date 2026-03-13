import { describe, it } from 'vitest'
import { atom, createStore } from 'jotai'

describe('perf: WeakMap lookup reduction benchmark', () => {
  it('benchmarks store.get with 2000+ derived atoms (deep chain)', () => {
    const store = createStore()
    // Keep chain depth small enough to avoid stack overflow from recursive reads,
    // but use many iterations to amplify the WeakMap lookup cost.
    const NUM_ATOMS = 500
    const ITERATIONS = 500

    // Build a deep chain: each derived atom depends on the previous one
    const baseAtom = atom(1)
    const derivedAtoms: ReturnType<typeof atom<number>>[] = [baseAtom]

    for (let i = 1; i < NUM_ATOMS; i++) {
      const prev = derivedAtoms[i - 1]!
      derivedAtoms.push(atom((get) => get(prev) + 1))
    }

    const lastAtom = derivedAtoms[NUM_ATOMS - 1]!

    // Warm up
    store.get(lastAtom)

    // Time store.get on the last atom (traverses entire chain)
    const getStart = performance.now()
    for (let i = 0; i < ITERATIONS; i++) {
      store.get(lastAtom)
    }
    const getEnd = performance.now()
    const getTime = getEnd - getStart

    console.log(
      `[deep chain] store.get x${ITERATIONS} on ${NUM_ATOMS} derived atoms: ${getTime.toFixed(2)}ms`,
    )
  })

  it('benchmarks store.set with 2000+ derived atoms (wide fan-out)', () => {
    const store = createStore()
    const NUM_DERIVED = 2500
    const ITERATIONS = 50

    // Build a wide fan-out: one base atom, many derived atoms depending on it
    const baseAtom = atom(0)
    const derivedAtoms: ReturnType<typeof atom<number>>[] = []

    for (let i = 0; i < NUM_DERIVED; i++) {
      derivedAtoms.push(atom((get) => get(baseAtom) + i))
    }

    // Subscribe to all derived atoms so they are mounted
    const unsubs: (() => void)[] = []
    for (const d of derivedAtoms) {
      unsubs.push(store.sub(d, () => {}))
    }

    // Warm up
    store.set(baseAtom, 1)

    // Time store.set (triggers recomputation of all derived atoms)
    const setStart = performance.now()
    for (let i = 0; i < ITERATIONS; i++) {
      store.set(baseAtom, i + 2)
    }
    const setEnd = performance.now()
    const setTime = setEnd - setStart

    console.log(
      `[wide fan-out] store.set x${ITERATIONS} on ${NUM_DERIVED} derived atoms: ${setTime.toFixed(2)}ms`,
    )

    // Cleanup
    for (const unsub of unsubs) {
      unsub()
    }
  })

  it('benchmarks store.get with 2000+ unmounted derived atoms (diamond pattern)', () => {
    const store = createStore()
    const NUM_LAYERS = 50
    const WIDTH = 50 // Total atoms ~ NUM_LAYERS * WIDTH = 2500
    const ITERATIONS = 50

    // Build diamond: each layer depends on atoms from the previous layer
    const layers: ReturnType<typeof atom<number>>[][] = []

    // Base layer
    const baseLayer: ReturnType<typeof atom<number>>[] = []
    for (let i = 0; i < WIDTH; i++) {
      baseLayer.push(atom(i))
    }
    layers.push(baseLayer)

    // Derived layers
    for (let layer = 1; layer < NUM_LAYERS; layer++) {
      const prevLayer = layers[layer - 1]!
      const currentLayer: ReturnType<typeof atom<number>>[] = []
      for (let i = 0; i < WIDTH; i++) {
        const dep1 = prevLayer[i]!
        const dep2 = prevLayer[(i + 1) % WIDTH]!
        currentLayer.push(atom((get) => get(dep1) + get(dep2)))
      }
      layers.push(currentLayer)
    }

    const lastLayer = layers[NUM_LAYERS - 1]!

    // Warm up - read all atoms in last layer
    for (const a of lastLayer) {
      store.get(a)
    }

    // Time repeated reads of unmounted atoms
    const getStart = performance.now()
    for (let iter = 0; iter < ITERATIONS; iter++) {
      for (const a of lastLayer) {
        store.get(a)
      }
    }
    const getEnd = performance.now()
    const getTime = getEnd - getStart

    console.log(
      `[diamond] store.get x${ITERATIONS} on ${NUM_LAYERS * WIDTH} atoms (${NUM_LAYERS} layers x ${WIDTH} wide): ${getTime.toFixed(2)}ms`,
    )
  })
})
