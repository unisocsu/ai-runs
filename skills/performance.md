# Performance analysis

Measure or estimate the actual bottleneck before proposing optimizations. Separate cold-start costs, downloads, compilation, model loading, inference, and I/O. Prefer caching stable build outputs, avoid caching mutable or incompatible binaries without a robust key, and preserve reproducibility. Quantify trade-offs and identify what still needs benchmarking.