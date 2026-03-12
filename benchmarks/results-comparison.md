# Benchmark Comparison: main vs performance-optimizations

All values in ops/s (higher is better). Speedup = perf-opts / main.

## simple-read

| Benchmark | main (ops/s) | perf-opts (ops/s) | Speedup |
|---|---:|---:|---:|
| atoms=100 | 7.30M | 28.71M | **3.93x** |
| atoms=1000 | 7.40M | 28.25M | **3.82x** |
| atoms=10000 | 7.44M | 28.37M | **3.82x** |
| atoms=100000 | 7.32M | 28.26M | **3.86x** |
| atoms=1000000 | 7.36M | 28.42M | **3.86x** |

## simple-write

| Benchmark | main (ops/s) | perf-opts (ops/s) | Speedup |
|---|---:|---:|---:|
| atoms=100 | 487.0K | 532.8K | **1.09x** |
| atoms=1000 | 480.7K | 528.5K | **1.10x** |
| atoms=10000 | 485.6K | 533.0K | **1.10x** |
| atoms=100000 | 484.6K | 529.9K | **1.09x** |
| atoms=1000000 | 484.2K | 531.6K | **1.10x** |

## subscribe-write

| Benchmark | main (ops/s) | perf-opts (ops/s) | Speedup |
|---|---:|---:|---:|
| atoms=100 | 367.4K | 396.8K | **1.08x** |
| atoms=1000 | 386.3K | 255.9K | **0.66x** |
| atoms=10000 | 372.8K | 414.5K | **1.11x** |
| atoms=100000 | 361.2K | 393.9K | **1.09x** |
| atoms=1000000 | 310.6K | 369.6K | **1.19x** |

## derived-read

| Benchmark | main (ops/s) | perf-opts (ops/s) | Speedup |
|---|---:|---:|---:|
| cached: chain depth=10 | 694.2K | 26.99M | **38.87x** |
| cached: chain depth=50 | 158.6K | 27.47M | **173.24x** |
| cached: chain depth=100 | 80.3K | 28.06M | **349.29x** |
| read-after-write: chain depth=10 | 30.5K | 65.8K | **2.16x** |
| read-after-write: chain depth=50 | 3.5K | 14.6K | **4.19x** |
| read-after-write: chain depth=100 | 1.1K | 7.4K | **6.66x** |
| diamond: layers=3 (cached) | 546.8K | 28.03M | **51.26x** |
| diamond: layers=5 (cached) | 142.3K | 27.88M | **195.90x** |
| diamond: layers=7 (cached) | 30.1K | 27.02M | **897.09x** |
| diamond: layers=10 (cached) | 3.8K | 28.39M | **7483.12x** |
| diamond: layers=3 (read-after-write) | 79.2K | 133.7K | **1.69x** |
| diamond: layers=5 (read-after-write) | 33.4K | 84.1K | **2.51x** |
| diamond: layers=7 (read-after-write) | 11.4K | 56.3K | **4.93x** |
| diamond: layers=10 (read-after-write) | 1.7K | 36.9K | **21.27x** |
| tree depth=4 (read-after-write) | 11.4K | 18.6K | **1.63x** |
| tree depth=6 (read-after-write) | 2.9K | 4.7K | **1.64x** |
| tree depth=8 (read-after-write) | 679 | 1.2K | **1.72x** |
| tree depth=10 (read-after-write) | 176 | 285 | **1.62x** |
| wide deps=10 (cached) | 548.6K | 25.01M | **45.59x** |
| wide deps=50 (cached) | 123.8K | 25.96M | **209.67x** |
| wide deps=100 (cached) | 64.5K | 26.23M | **406.40x** |
| wide deps=500 (cached) | 12.4K | 24.48M | **1978.30x** |
| wide deps=10 (read-after-write) | 124.2K | 194.7K | **1.57x** |
| wide deps=50 (read-after-write) | 50.5K | 85.8K | **1.70x** |
| wide deps=100 (read-after-write) | 29.4K | 51.1K | **1.74x** |
| wide deps=500 (read-after-write) | 6.5K | 11.1K | **1.71x** |
| compute chain depth=10 (cached) | 552.6K | 26.22M | **47.46x** |
| compute chain depth=50 (cached) | 124.6K | 26.07M | **209.21x** |
| compute chain depth=100 (cached) | 63.0K | 25.52M | **405.12x** |
| compute chain depth=10 (read-after-write) | 28.1K | 61.5K | **2.19x** |
| compute chain depth=50 (read-after-write) | 2.9K | 14.2K | **4.91x** |
| compute chain depth=100 (read-after-write) | 917 | 7.2K | **7.86x** |
| multi-read diamond layers=5 | 23.2K | 74.9K | **3.22x** |
| multi-read diamond layers=8 | 4.2K | 43.7K | **10.48x** |

