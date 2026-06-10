package engine

import (
	"container/heap"
	"math"
)

// Sixteen-point compass moves: rook/bishop steps plus knight steps, giving
// 22.5°-granularity headings so the router can actually use the wind.
var moves = [][2]int{
	{1, 0}, {1, 1}, {0, 1}, {-1, 1}, {-1, 0}, {-1, -1}, {0, -1}, {1, -1},
	{2, 1}, {1, 2}, {-1, 2}, {-2, 1}, {-2, -1}, {-1, -2}, {1, -2}, {2, -1},
}

type pqItem struct {
	idx  int32
	dist float32
}

type pq []pqItem

func (p pq) Len() int            { return len(p) }
func (p pq) Less(a, b int) bool  { return p[a].dist < p[b].dist }
func (p pq) Swap(a, b int)       { p[a], p[b] = p[b], p[a] }
func (p *pq) Push(x any)         { *p = append(*p, x.(pqItem)) }
func (p *pq) Pop() any           { old := *p; n := len(old); it := old[n-1]; *p = old[:n-1]; return it }

// SailTimes runs Dijkstra from a water cell and returns hours-at-sea for
// every cell (math.MaxFloat32 where unreachable or land).
func (g *Grid) SailTimes(srcI, srcJ int) []float32 {
	n := g.W * g.H
	dist := make([]float32, n)
	for i := range dist {
		dist[i] = math.MaxFloat32
	}
	src := g.Idx(srcI, srcJ)
	dist[src] = 0
	q := &pq{{int32(src), 0}}

	for q.Len() > 0 {
		it := heap.Pop(q).(pqItem)
		if it.dist > dist[it.idx] {
			continue
		}
		ci := int(it.idx) % g.W
		cj := int(it.idx) / g.W
		lon0, lat0 := g.LonLat(ci, cj)

		for _, m := range moves {
			nj := cj + m[1]
			if nj < 0 || nj >= g.H {
				continue
			}
			ni := ((ci+m[0])%g.W + g.W) % g.W
			nIdx := g.Idx(ni, nj)
			if !g.Water[nIdx] {
				continue
			}
			// Don't cut corners over land: orthogonal-adjacent water must
			// exist for diagonal moves, and knight moves need a clear
			// intermediate cell.
			if m[0] != 0 && m[1] != 0 && !g.stepClear(ci, cj, m[0], m[1]) {
				continue
			}

			_, lat1 := g.LonLat(ni, nj)
			midLat := (lat0 + lat1) / 2
			dLonDeg := float64(m[0]) * g.Res
			dLatDeg := -float64(m[1]) * g.Res // +j is south
			east := dLonDeg * math.Cos(midLat*math.Pi/180) * 60
			north := dLatDeg * 60
			distNM := math.Hypot(east, north)
			bearing := math.Mod(math.Atan2(east, north)*180/math.Pi+360, 360)
			midLon := lon0 + dLonDeg/2
			if midLon > 180 {
				midLon -= 360
			} else if midLon < -180 {
				midLon += 360
			}
			v := SpeedAt(midLon, midLat, bearing)
			if v <= 0 {
				continue
			}
			nd := it.dist + float32(distNM/v)
			if nd < dist[nIdx] {
				dist[nIdx] = nd
				heap.Push(q, pqItem{int32(nIdx), nd})
			}
		}
	}
	return dist
}

// stepClear verifies a diagonal or knight move doesn't jump a land barrier.
func (g *Grid) stepClear(ci, cj, di, dj int) bool {
	water := func(i, j int) bool {
		if j < 0 || j >= g.H {
			return false
		}
		return g.Water[g.Idx(((i%g.W)+g.W)%g.W, j)]
	}
	if abs(di) == 1 && abs(dj) == 1 {
		return water(ci+di, cj) || water(ci, cj+dj)
	}
	// Knight move: the two cells nearest the line from start to end.
	mi, mj := di/2, dj/2 // the long-axis half-step
	if abs(di) == 2 {
		return water(ci+mi, cj) && water(ci+mi, cj+dj)
	}
	return water(ci, cj+mj) && water(ci+di, cj+mj)
}
