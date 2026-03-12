#!/usr/bin/env npx tsx

/// <reference types="node" />

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { add, complete, cycle, save, suite } from 'benny'
import { atom } from '../src/vanilla/atom.ts'
import { createStore } from '../src/vanilla/store.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Helpers ──────────────────────────────────────────────────────────

/** Linear chain: base → d1 → d2 → … → dN (each reads one dep) */
const createDerivedChain = (depth: number) => {
  const store = createStore()
  const baseAtom = atom(1)
  store.set(baseAtom, 1)
  let prev = baseAtom as ReturnType<typeof atom<number>>
  for (let i = 0; i < depth; ++i) {
    const dep = prev
    prev = atom((get) => get(dep) + 1)
  }
  return [store, baseAtom, prev] as const
}

/** Wide fan-in: N base atoms → one derived that sums them all */
const createWideDerived = (width: number) => {
  const store = createStore()
  const bases = Array.from({ length: width }, (_, i) => {
    const a = atom(i)
    store.set(a, i)
    return a
  })
  const derived = atom((get) => bases.reduce((sum, a) => sum + get(a), 0))
  return [store, bases, derived] as const
}

/**
 * Diamond DAG – the topology where caching matters most.
 *
 *   layers=3 builds:
 *
 *       L0:  [b0, b1, b2, b3]          ← 4 base atoms
 *       L1:  [d0=b0+b1, d1=b1+b2, d2=b2+b3]  ← each reads 2 neighbours (shared deps!)
 *       L2:  [d0=L1[0]+L1[1], d1=L1[1]+L1[2]]
 *       L3:  [top = L2[0] + L2[1]]
 *
 * Without read caching the shared interior nodes are re-walked exponentially.
 */
const createDiamondDAG = (layers: number) => {
  const store = createStore()
  const width = layers + 1
  let prev: ReturnType<typeof atom<number>>[] = Array.from(
    { length: width },
    (_, i) => {
      const a = atom(i)
      store.set(a, i)
      return a
    },
  )
  const bases = prev.slice() // keep references to base atoms for writes
  for (let layer = 0; layer < layers; ++layer) {
    const next: ReturnType<typeof atom<number>>[] = []
    for (let j = 0; j < prev.length - 1; ++j) {
      const left = prev[j]!
      const right = prev[j + 1]!
      next.push(atom((get) => get(left) + get(right)))
    }
    prev = next
  }
  return [store, bases, prev[0]!] as const
}

/**
 * Deep tree: a binary tree of derived atoms of the given depth.
 * leaf count = 2^depth, each interior node reads its two children.
 * Total nodes = 2^(depth+1) - 1.
 */
const createDeepTree = (depth: number) => {
  const store = createStore()
  const buildLevel = (d: number): ReturnType<typeof atom<number>> => {
    if (d === 0) {
      const a = atom(1)
      store.set(a, 1)
      return a
    }
    const left = buildLevel(d - 1)
    const right = buildLevel(d - 1)
    return atom((get) => get(left) + get(right))
  }
  const root = buildLevel(depth)
  return [store, root] as const
}

/**
 * Computed chain with non-trivial read functions.
 * Each derived atom does a small amount of work (arithmetic) in its read,
 * making the per-node cost more realistic than a bare `get(dep) + 1`.
 */
const createComputeChain = (depth: number) => {
  const store = createStore()
  const baseAtom = atom(1)
  store.set(baseAtom, 1)
  let prev = baseAtom as ReturnType<typeof atom<number>>
  for (let i = 0; i < depth; ++i) {
    const dep = prev
    const idx = i
    prev = atom((get) => {
      const v = get(dep)
      // Simulate light computation (hash-like mixing)
      return ((v * 2654435761) >>> 0) ^ (idx + 1)
    })
  }
  return [store, baseAtom, prev] as const
}

// ── Benchmark suite ──────────────────────────────────────────────────

const main = async () => {
  await suite(
    'derived-read',

    // ── 1. Cached reads (no mutation between reads) ──
    // This measures the epoch-cache fast path.
    // With caching: O(1). Without: O(depth) per call.
    ...[10, 50, 100].map((depth) =>
      add(`cached: chain depth=${depth}`, () => {
        const [store, _base, derived] = createDerivedChain(depth)
        store.get(derived) // prime the cache
        return () => store.get(derived)
      }),
    ),

    // ── 2. Read-after-write (cache fully invalidated each iteration) ──
    // Forces a full dependency walk on every read.
    ...[10, 50, 100].map((depth) =>
      add(`read-after-write: chain depth=${depth}`, () => {
        const [store, base, derived] = createDerivedChain(depth)
        let counter = 1
        return () => {
          store.set(base, ++counter)
          store.get(derived)
        }
      }),
    ),

    // ── 3. Diamond DAG – the key topology for cache impact ──
    // Shared deps mean uncached reads grow exponentially with layers.
    ...[3, 5, 7, 10].map((layers) =>
      add(`diamond: layers=${layers} (cached)`, () => {
        const [store, _bases, top] = createDiamondDAG(layers)
        store.get(top) // prime
        return () => store.get(top)
      }),
    ),
    ...[3, 5, 7, 10].map((layers) =>
      add(`diamond: layers=${layers} (read-after-write)`, () => {
        const [store, bases, top] = createDiamondDAG(layers)
        let counter = 0
        return () => {
          store.set(bases[0]!, ++counter)
          store.get(top)
        }
      }),
    ),

    // ── 4. Deep binary tree (uncached) ──
    // 2^depth leaves, each interior node reads two children.
    // Without caching, exponential blowup in dep walks.
    ...[4, 6, 8, 10].map((depth) =>
      add(`tree depth=${depth} (read-after-write)`, () => {
        // For a tree, we don't have a single base to mutate easily.
        // Instead, create a fresh store read on each iteration by
        // creating a new store and reading the root.
        const root = (() => {
          const buildLevel = (
            d: number,
          ): ReturnType<typeof atom<number>> => {
            if (d === 0) return atom(1)
            const left = buildLevel(d - 1)
            const right = buildLevel(d - 1)
            return atom((get) => get(left) + get(right))
          }
          return buildLevel(depth)
        })()
        // Each iteration: fresh store → first read forces full walk
        return () => {
          const s = createStore()
          s.get(root)
        }
      }),
    ),

    // ── 5. Wide fan-in (cached vs uncached) ──
    ...[10, 50, 100, 500].map((width) =>
      add(`wide deps=${width} (cached)`, () => {
        const [store, _bases, derived] = createWideDerived(width)
        store.get(derived)
        return () => store.get(derived)
      }),
    ),
    ...[10, 50, 100, 500].map((width) =>
      add(`wide deps=${width} (read-after-write)`, () => {
        const [store, bases, derived] = createWideDerived(width)
        let counter = 0
        return () => {
          store.set(bases[0]!, ++counter)
          store.get(derived)
        }
      }),
    ),

    // ── 6. Compute chain – non-trivial read functions ──
    ...[10, 50, 100].map((depth) =>
      add(`compute chain depth=${depth} (cached)`, () => {
        const [store, _base, derived] = createComputeChain(depth)
        store.get(derived) // prime
        return () => store.get(derived)
      }),
    ),
    ...[10, 50, 100].map((depth) =>
      add(`compute chain depth=${depth} (read-after-write)`, () => {
        const [store, base, derived] = createComputeChain(depth)
        let counter = 1
        return () => {
          store.set(base, ++counter)
          store.get(derived)
        }
      }),
    ),

    // ── 7. Multiple reads from the same graph ──
    // Reads several nodes at different depths from one diamond.
    // Tests whether reading one node caches results for siblings.
    ...[5, 8].map((layers) =>
      add(`multi-read diamond layers=${layers}`, () => {
        const store = createStore()
        const width = layers + 1
        let prev: ReturnType<typeof atom<number>>[] = Array.from(
          { length: width },
          (_, i) => {
            const a = atom(i)
            store.set(a, i)
            return a
          },
        )
        const bases = prev.slice()
        const midpoints: ReturnType<typeof atom<number>>[] = []
        for (let layer = 0; layer < layers; ++layer) {
          const next: ReturnType<typeof atom<number>>[] = []
          for (let j = 0; j < prev.length - 1; ++j) {
            const left = prev[j]!
            const right = prev[j + 1]!
            next.push(atom((get) => get(left) + get(right)))
          }
          // Capture midpoints at the halfway layer
          if (layer === Math.floor(layers / 2)) {
            midpoints.push(...next)
          }
          prev = next
        }
        const top = prev[0]!
        // Prime all reads
        store.get(top)
        midpoints.forEach((m) => store.get(m))
        let counter = 0
        return () => {
          store.set(bases[0]!, ++counter)
          store.get(top)
          // Also read the midpoints – tests shared subgraph caching
          for (let i = 0; i < midpoints.length; ++i) {
            store.get(midpoints[i]!)
          }
        }
      }),
    ),

    cycle(),
    complete(),
    save({
      folder: __dirname,
      file: 'derived-read',
      format: 'json',
    }),
    save({
      folder: __dirname,
      file: 'derived-read',
      format: 'chart.html',
    }),
  )
}

main()
