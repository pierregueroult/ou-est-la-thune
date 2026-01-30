Wastar Benchmark Results
We extracted the wastar function and benchmarked it against
roads-france-90.json
(Territoire de Belfort).

Methodology
Graph:
roads-france-90.json
(270k nodes)
Pairs: 50 random start/end points
Algorithm: Weighted A* (f = g + w * h)
Metric: Average execution time vs. Average path cost

Results
Weight Avg Time (ms) Avg Visited Nodes Avg Cost (m) Cost Increase
1.0 (Dijkstra/A\*) 135.85 32,801 15,710 +0% (Optimal)
1.1 91.78 20,577 15,727 +0.1%
1.2 41.97 11,270 15,855 +0.9%
1.5 8.37 3,330 16,529 +5.2%
2.0 4.35 1,872 17,080 +8.7%
3.0 3.65 1,606 17,805 +13.3%
5.0 3.80 1,573 18,567 +18.2%

Conclusion
Weight 1.5 is the "sweet spot". It yields a 16x speedup compared to optimal A\* (1.0), with only a 5% increase in path distance.
Increasing the weight beyond 1.5 provides diminishing returns in speed (only ~2x faster) while path quality significantly degrades.
The current implementation uses 1.5, which is validated by this benchmark.
