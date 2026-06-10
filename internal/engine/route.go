package engine

import (
	"container/heap"
	"math"
)

// SailRoute runs the same wind-aware Dijkstra as SailTimes but tracks
// parents and stops as soon as the destination is settled, then returns the
// time-optimal track as cell-center coordinates with cumulative hours.
// Longitudes are cumulatively unwrapped (may exceed ±180) so the track
// crosses the antimeridian without jumps. Returns ok=false when the
// destination is unreachable.
func (g *Grid) SailRoute(srcI, srcJ, dstI, dstJ int) (coords [][2]float64, hours []float32, ok bool) {
	n := g.W * g.H
	dist := make([]float32, n)
	parent := make([]int32, n)
	for i := range dist {
		dist[i] = math.MaxFloat32
		parent[i] = -1
	}
	src := g.Idx(srcI, srcJ)
	dst := g.Idx(dstI, dstJ)
	dist[src] = 0
	q := &pq{{int32(src), 0}}

	for q.Len() > 0 {
		it := heap.Pop(q).(pqItem)
		if it.dist > dist[it.idx] {
			continue
		}
		if int(it.idx) == dst {
			break // settled: dist[dst] is final in Dijkstra
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
				parent[nIdx] = it.idx
				heap.Push(q, pqItem{int32(nIdx), nd})
			}
		}
	}

	if dist[dst] >= math.MaxFloat32 {
		return nil, nil, false
	}

	// Backtrace dst → src via parents (cycle-guarded), then reverse.
	idxPath := make([]int32, 0, 1024)
	for cur := int32(dst); ; {
		idxPath = append(idxPath, cur)
		if int(cur) == src {
			break
		}
		if len(idxPath) > n {
			return nil, nil, false // corrupt parent chain
		}
		cur = parent[cur]
		if cur < 0 {
			return nil, nil, false
		}
	}
	for a, b := 0, len(idxPath)-1; a < b; a, b = a+1, b-1 {
		idxPath[a], idxPath[b] = idxPath[b], idxPath[a]
	}

	// Cell centers + cumulative hours, with cumulative lon-unwrapping.
	pts := make([]routePt, 0, len(idxPath))
	for k, idx := range idxPath {
		lon, lat := g.LonLat(int(idx)%g.W, int(idx)/g.W)
		if k > 0 {
			prev := pts[k-1].lon
			for lon-prev > 180 {
				lon -= 360
			}
			for lon-prev < -180 {
				lon += 360
			}
		}
		pts = append(pts, routePt{lon, lat, dist[idx]})
	}

	// Two rounds of open-polyline Chaikin smoothing (endpoints pinned).
	pts = chaikinOpen(chaikinOpen(pts))

	coords = make([][2]float64, len(pts))
	hours = make([]float32, len(pts))
	for k, p := range pts {
		coords[k] = [2]float64{p.lon, p.lat}
		hours[k] = p.h
		if k > 0 && hours[k] < hours[k-1] {
			hours[k] = hours[k-1] // clamp float-rounding inversions
		}
	}
	return coords, hours, true
}

type routePt struct {
	lon, lat float64
	h        float32
}

// chaikinOpen performs one corner-cutting iteration on an open polyline of
// (lon, lat, hours) triples. Endpoints are kept; each interior segment is
// replaced by its 1/4 and 3/4 affine mixes, which preserves hour
// monotonicity.
func chaikinOpen(pts []routePt) []routePt {
	if len(pts) < 3 {
		return pts
	}
	out := make([]routePt, 0, 2*len(pts))
	out = append(out, pts[0])
	for i := 0; i+1 < len(pts); i++ {
		p, q := pts[i], pts[i+1]
		out = append(out,
			routePt{0.75*p.lon + 0.25*q.lon, 0.75*p.lat + 0.25*q.lat, 0.75*p.h + 0.25*q.h},
			routePt{0.25*p.lon + 0.75*q.lon, 0.25*p.lat + 0.75*q.lat, 0.25*p.h + 0.75*q.h})
	}
	out = append(out, pts[len(pts)-1])
	return out
}

// TrackLengthNM sums haversine great-circle distances over a track's
// vertices, in nautical miles.
func TrackLengthNM(coords [][2]float64) float64 {
	const rNM = 3440.065 // mean Earth radius in nautical miles
	total := 0.0
	for k := 1; k < len(coords); k++ {
		lon1, lat1 := coords[k-1][0]*math.Pi/180, coords[k-1][1]*math.Pi/180
		lon2, lat2 := coords[k][0]*math.Pi/180, coords[k][1]*math.Pi/180
		sLat := math.Sin((lat2 - lat1) / 2)
		sLon := math.Sin((lon2 - lon1) / 2)
		a := sLat*sLat + math.Cos(lat1)*math.Cos(lat2)*sLon*sLon
		total += 2 * rNM * math.Asin(math.Min(1, math.Sqrt(a)))
	}
	return total
}
