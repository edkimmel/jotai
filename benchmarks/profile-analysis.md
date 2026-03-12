# Derived Read Benchmark — Profiling Analysis

**Date:** 2026-03-12
**Branch:** `claude/profile-read-benchmark-fQLV3`
**Node:** v22.22.0
**Method:** V8 `--prof` on esbuild-bundled benchmark (41,445 ticks total)

## Benchmark Timing Results

| Scenario | Time |
|---|---|
| Chain depth=10 read-after-write (200k iters) | 2.6s |
| Chain depth=50 read-after-write (200k iters) | 11.9s |
| Chain depth=100 read-after-write (200k iters) | 24.1s |
| Diamond layers=5 read-after-write (100k iters) | 1.1s |
| Diamond layers=7 read-after-write (100k iters) | 1.7s |
| Diamond layers=10 read-after-write (100k iters) | 2.6s |
| Chain depth=10 cached (1M iters) | 43ms |
| Chain depth=50 cached (1M iters) | 55ms |
| Chain depth=100 cached (1M iters) | 53ms |

**Cached reads are fast** — the epoch-cache optimization works well. The
bottlenecks are entirely in the **read-after-write** (invalidation + recompute)
path.

## V8 Profile: Top Functions by Self-Time

| Ticks | % (non-lib) | Function |
|---|---|---|
| 7,277 | 18.7% | `BUILDING_BLOCK_readAtomState` |
| 4,161 | 10.7% | `Builtin: KeyedLoadIC` (array index access on buildingBlocks) |
| 4,003 | 10.3% | `Builtin: WeakMapLookupHashIndex` |
| 1,515 | 3.9% | `Builtin: WeakMapGet` |
| 1,005 | 2.6% | `Builtin: KeyedLoadICTrampoline` |
| 758 | 1.9% | `BUILDING_BLOCK_setAtomStateValueOrPromise` |
| 578 | 1.5% | `Builtin: MapPrototypeSet` |
| 444 | 1.1% | `Builtin: RecordWriteSaveFP` (GC write barriers) |
| 354 | 0.9% | Chain atom read fn `(get) => get(dep) + 1` |
| 323 | 0.8% | `Builtin: WeakCollectionSet` |
| 314 | 0.8% | `Builtin: FindOrderedHashMapEntry` (Map lookups) |
| 194 | 0.5% | `Builtin: WeakCollectionDelete` |
| 163 | 0.4% | `Builtin: WeakMapPrototypeHas` |
| 110 | 0.3% | `Builtin: DeleteProperty` |

**GC overhead:** 11.9% of total time (4,946 ticks).

## Bottleneck Analysis

### 1. `readAtomState` itself — 18.7% self-time

This is the main recomputation function. Its self-time (code within the function
body, excluding callees) is the single largest item. The overhead comes from:

- **Extracting building blocks** from the frozen array on every call
  (`buildingBlocks[0]`, `buildingBlocks[1]`, etc.). This shows up as
  `KeyedLoadIC` (10.7%) and `KeyedLoadICTrampoline` (2.6%) — a combined
  **13.3%** of non-library time just doing array index lookups.
- **Creating the `getter` closure** on every recomputation (line 644). Each call
  to `readAtomState` that needs recomputation allocates a new closure capturing
  `store`, `atom`, `atomState`, `currentEpoch`, etc.
- **Creating the `options` object** with getters for `signal` and `setSelf`.

### 2. WeakMap operations — 15.2% combined

| Operation | Ticks | % |
|---|---|---|
| `WeakMapLookupHashIndex` | 4,003 | 10.3% |
| `WeakMapGet` | 1,515 | 3.9% |
| `WeakMapPrototypeHas` | 163 | 0.4% |
| `WeakCollectionSet` | 323 | 0.8% |

WeakMap is used pervasively:
- `atomStateMap.get(atom)` in `ensureAtomState` (called every recursion)
- `mountedMap.has(atom)` in `readAtomState` (called every recursion)
- `invalidatedAtoms.get(atom)` in `readAtomState`
- `epochState.verified.get(atom)` in the epoch cache check
- `storeEpochMap.get(store)` in `getStoreEpochState`

Each `readAtomState` call in the **read-after-write** path performs at minimum
**4-5 WeakMap lookups** before it can decide whether to return cached state or
recompute.

### 3. Map operations — 2.3% combined

- `MapPrototypeSet` (1.5%): `atomState.d.set(a, aState.n)` and
  `atomState.g.set(a, currentEpoch)` in the getter closure — **two Map.set
  calls per dependency** per recomputation.
- `FindOrderedHashMapEntry` (0.8%): Map lookups for `atomState.d` iteration in
  the dependency-changed check loop.

### 4. `setAtomStateValueOrPromise` — 1.9%

Called for every atom that gets recomputed. The overhead is:
- `'v' in atomState` / `'e' in atomState` checks (uses property presence, not
  a boolean flag)
- `Object.is(prevValue, atomState.v)` comparison
- `delete atomState.e` — the `DeleteProperty` builtin shows 0.3%

### 5. GC pressure — 11.9%

The `RecordWriteSaveFP` (1.1%) indicates GC write barriers. Sources of
allocation pressure:
- **Closure allocation**: Every `readAtomState` recomputation creates a `getter`
  closure and an `options` object
- **Map iterator allocation**: `for (const [a, n] of atomState.d)` creates
  destructured iterator entries
- **Tuple allocation**: `epochState.verified.set(atom, [epochState.epoch,
  atomState.n])` creates a 2-element array on every verification cache write

### 6. Per-node cost breakdown

Micro-benchmarking shows a per-node cost of ~1.1-2.3 µs in the read-after-write
path:

| Chain depth | Per-node cost |
|---|---|
| 1 | 2.3 µs |
| 5 | 1.4 µs |
| 10 | 1.3 µs |
| 20 | 1.2 µs |
| 50 | 1.1 µs |

The higher cost at depth=1 reflects the fixed overhead of `store.set` +
`store.get` amortized over fewer nodes. At depth >= 10, the per-node cost
stabilizes around 1.1-1.3 µs, which is the true per-node `readAtomState`
overhead.

## Potential Optimization Opportunities

### High Impact

1. **Reduce WeakMap lookups per readAtomState call.** Currently each recursive
   call does `ensureAtomState` (WeakMap get + potential set),
   `mountedMap.has()`, `invalidatedAtoms.get()`, and potentially
   `epochState.verified.get()`. Batching or caching these across the recursion
   could cut the 15% WeakMap overhead significantly.

2. **Avoid re-extracting building blocks on every call.** The `readAtomState`
   function calls `getInternalBuildingBlocks(store)` and then does 4+ indexed
   accesses into the frozen array. Since `readAtomState` recurses into itself
   (via the getter → `readAtomState`), the same building blocks are re-extracted
   at every level. Passing them as a parameter or using a thread-local/recursive
   context could eliminate the 13% `KeyedLoadIC` overhead.

3. **Eliminate per-recomputation closure allocation.** The `getter` closure
   created at line 644 captures multiple variables and is allocated on every
   `readAtomState` call that hits the recomputation path. Since V8 can't stack-
   allocate closures that escape (they're passed to `atomRead`), this causes
   heap allocation + GC pressure. A pre-allocated getter with mutable state
   could avoid this.

### Medium Impact

4. **Use a flag instead of `delete` for atomState.e.** The `delete` operator
   triggers V8 to transition the object to dictionary mode (slow properties).
   Using `atomState.e = undefined` with an explicit `hasError` flag avoids
   this.

5. **Avoid Map iterator allocation in dep checks.** Replace
   `for (const [a, n] of atomState.d)` with `atomState.d.forEach()` or
   manual `.keys()` + `.get()` iteration to avoid destructuring overhead.

6. **Pool or reuse the epoch verification tuple.** Instead of
   `[epochState.epoch, atomState.n]` creating a new array each time, reuse
   the existing entry object.

### Lower Impact

7. **Replace `isAtomStateInitialized` (`'v' in atomState || 'e' in atomState`)**
   with a boolean flag on AtomState. The `in` operator is slower than a
   direct property access.

8. **Reduce `isPromiseLike` checks.** In the read-after-write hot path for
   synchronous atoms, `isPromiseLike(atomState.v)` is checked multiple times
   and always false. A flag could avoid the dynamic type check.
