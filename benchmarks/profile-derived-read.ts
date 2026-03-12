#!/usr/bin/env npx tsx

/**
 * Profiling harness for derived atom reads.
 *
 * Usage:
 *   # CPU profile (generates a .cpuprofile file viewable in Chrome DevTools):
 *   node --cpu-prof --cpu-prof-dir=benchmarks npx tsx benchmarks/profile-derived-read.ts
 *
 *   # Or with V8 sampling profiler:
 *   node --prof npx tsx benchmarks/profile-derived-read.ts
 *   node --prof-process isolate-*.log > benchmarks/profile.txt
 *
 * This script runs hot loops of the most revealing scenarios
 * (diamond DAG read-after-write and chain read-after-write)
 * so that profiling output is dominated by actual store overhead.
 */

import { atom } from '../src/vanilla/atom.ts'
import { createStore } from '../src/vanilla/store.ts'

// ── Helpers ──────────────────────────────────────────────────────────

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
  const bases = prev.slice()
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

// ── Profiling loops ──────────────────────────────────────────────────

const ITERATIONS = 200_000

function profileChainReadAfterWrite(depth: number) {
  const [store, base, derived] = createDerivedChain(depth)
  let counter = 1
  const label = `chain depth=${depth} read-after-write`
  console.time(label)
  for (let i = 0; i < ITERATIONS; i++) {
    store.set(base, ++counter)
    store.get(derived)
  }
  console.timeEnd(label)
}

function profileDiamondReadAfterWrite(layers: number) {
  const [store, bases, top] = createDiamondDAG(layers)
  let counter = 0
  const iters = Math.min(ITERATIONS, 100_000)
  const label = `diamond layers=${layers} read-after-write`
  console.time(label)
  for (let i = 0; i < iters; i++) {
    store.set(bases[0]!, ++counter)
    store.get(top)
  }
  console.timeEnd(label)
}

function profileCachedRead(depth: number) {
  const [store, _base, derived] = createDerivedChain(depth)
  store.get(derived) // prime
  const label = `chain depth=${depth} cached`
  console.time(label)
  for (let i = 0; i < ITERATIONS * 5; i++) {
    store.get(derived)
  }
  console.timeEnd(label)
}

// ── Main ─────────────────────────────────────────────────────────────

console.log('=== Profiling derived atom reads ===')
console.log(`Iterations: ${ITERATIONS}\n`)

// Warm up the JIT
profileChainReadAfterWrite(10)
profileDiamondReadAfterWrite(5)

console.log('\n--- Chain read-after-write ---')
profileChainReadAfterWrite(10)
profileChainReadAfterWrite(50)
profileChainReadAfterWrite(100)

console.log('\n--- Diamond read-after-write ---')
profileDiamondReadAfterWrite(5)
profileDiamondReadAfterWrite(7)
profileDiamondReadAfterWrite(10)

console.log('\n--- Cached reads (epoch cache fast path) ---')
profileCachedRead(10)
profileCachedRead(50)
profileCachedRead(100)

console.log('\nDone.')
