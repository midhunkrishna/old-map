package engine

import (
	"math"
	"sort"
)

// Grid is a regular lon/lat raster of the world ocean. Cell (i, j) has its
// center at lon = -180 + (i+0.5)*Res, lat = 90 - (j+0.5)*Res. Longitude
// wraps; latitude does not.
type Grid struct {
	W, H  int
	Res   float64
	Water []bool
	// Ocean marks water cells connected (by router moves) to the open sea,
	// so ports snap to navigable water rather than landlocked pockets.
	Ocean []bool
}

func NewGrid(res float64) *Grid {
	w := int(math.Round(360 / res))
	h := int(math.Round(180 / res))
	return &Grid{W: w, H: h, Res: res, Water: make([]bool, w*h)}
}

func (g *Grid) Idx(i, j int) int { return j*g.W + i }

func (g *Grid) LonLat(i, j int) (float64, float64) {
	return -180 + (float64(i)+0.5)*g.Res, 90 - (float64(j)+0.5)*g.Res
}

func (g *Grid) Cell(lon, lat float64) (int, int) {
	i := int(math.Floor((lon + 180) / g.Res))
	j := int(math.Floor((90 - lat) / g.Res))
	i = ((i % g.W) + g.W) % g.W
	if j < 0 {
		j = 0
	}
	if j >= g.H {
		j = g.H - 1
	}
	return i, j
}

type edge struct{ x1, y1, x2, y2 float64 }

// BuildLandMask rasterizes land polygon rings onto the grid with even-odd
// scanline filling. Each cell is sampled at three latitudes; a cell is land
// if at least two samples fall inside a polygon. The slight water bias keeps
// narrow but navigable straits open at coarse resolution.
func (g *Grid) BuildLandMask(rings []Ring) {
	var edges []edge
	for _, r := range rings {
		for k := 0; k+1 < len(r); k++ {
			a, b := r[k], r[k+1]
			if a[1] == b[1] {
				continue
			}
			edges = append(edges, edge{a[0], a[1], b[0], b[1]})
		}
	}

	// Bin edges by sample row so each scanline only visits edges crossing it.
	nSamples := g.H * 3
	sampleLat := func(s int) float64 {
		j := s / 3
		_, lat := g.LonLat(0, j)
		switch s % 3 {
		case 0:
			return lat + g.Res/3
		case 1:
			return lat
		default:
			return lat - g.Res/3
		}
	}
	latToSampleRange := func(lo, hi float64) (int, int) {
		// sample s has lat decreasing with s; invert approximately and widen.
		s1 := int((90-hi)/g.Res)*3 - 3
		s2 := int((90-lo)/g.Res)*3 + 3
		if s1 < 0 {
			s1 = 0
		}
		if s2 >= nSamples {
			s2 = nSamples - 1
		}
		return s1, s2
	}
	bins := make([][]int32, nSamples)
	for ei, e := range edges {
		lo, hi := e.y1, e.y2
		if lo > hi {
			lo, hi = hi, lo
		}
		s1, s2 := latToSampleRange(lo, hi)
		for s := s1; s <= s2; s++ {
			y := sampleLat(s)
			if (e.y1 <= y && y < e.y2) || (e.y2 <= y && y < e.y1) {
				bins[s] = append(bins[s], int32(ei))
			}
		}
	}

	landVotes := make([]uint8, g.W*g.H)
	xs := make([]float64, 0, 256)
	for s := 0; s < nSamples; s++ {
		if len(bins[s]) == 0 {
			continue
		}
		y := sampleLat(s)
		xs = xs[:0]
		for _, ei := range bins[s] {
			e := edges[ei]
			t := (y - e.y1) / (e.y2 - e.y1)
			xs = append(xs, e.x1+t*(e.x2-e.x1))
		}
		sort.Float64s(xs)
		j := s / 3
		// Fill alternate intervals (even-odd rule).
		for k := 0; k+1 < len(xs); k += 2 {
			i1 := int(math.Ceil((xs[k] + 180 - 0.5*g.Res) / g.Res))
			i2 := int(math.Floor((xs[k+1] + 180 - 0.5*g.Res) / g.Res))
			for i := i1; i <= i2; i++ {
				ii := ((i % g.W) + g.W) % g.W
				landVotes[g.Idx(ii, j)]++
			}
		}
	}
	for idx, v := range landVotes {
		g.Water[idx] = v < 2
	}

	g.carveStraits()
}

// carveStraits forces a handful of historically navigable straits open in
// case the raster resolution closed them.
func (g *Grid) carveStraits() {
	straits := [][4]float64{ // lon1, lat1, lon2, lat2
		{-6.5, 35.9, -4.5, 36.1},   // Gibraltar
		{1.0, 50.8, 2.0, 51.4},     // Dover
		{10.8, 57.8, 12.8, 55.8},   // Kattegat
		{12.8, 55.8, 12.4, 54.2},   // Øresund
		{105.6, -6.4, 105.9, -5.6}, // Sunda Strait
		{98.0, 5.5, 100.5, 2.8},    // Malacca Strait (north)
		{100.5, 2.8, 103.6, 1.1},   // Malacca Strait (south)
		{103.6, 1.1, 104.8, 1.4},   // Singapore Strait
		{43.2, 12.4, 43.8, 12.9},   // Bab-el-Mandeb
		{56.0, 26.2, 56.9, 26.7},   // Hormuz
		{-5.4, 35.9, -6.5, 35.9},   // Gibraltar approach
	}
	for _, s := range straits {
		steps := int(math.Max(math.Abs(s[2]-s[0]), math.Abs(s[3]-s[1]))/g.Res)*2 + 2
		for k := 0; k <= steps; k++ {
			t := float64(k) / float64(steps)
			lon := s[0] + t*(s[2]-s[0])
			lat := s[1] + t*(s[3]-s[1])
			i, j := g.Cell(lon, lat)
			g.Water[g.Idx(i, j)] = true
		}
	}
}

// MarkOcean flood-fills from a mid-ocean seed using the same moves as the
// router, recording which water cells a ship can actually reach.
func (g *Grid) MarkOcean(seedLon, seedLat float64) {
	g.Ocean = make([]bool, len(g.Water))
	si, sj := g.Cell(seedLon, seedLat)
	if !g.Water[g.Idx(si, sj)] {
		si, sj = g.NearestWater(seedLon, seedLat, 20)
	}
	queue := []int{g.Idx(si, sj)}
	g.Ocean[queue[0]] = true
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		ci, cj := cur%g.W, cur/g.W
		for _, m := range moves {
			nj := cj + m[1]
			if nj < 0 || nj >= g.H {
				continue
			}
			ni := ((ci+m[0])%g.W + g.W) % g.W
			nIdx := g.Idx(ni, nj)
			if !g.Water[nIdx] || g.Ocean[nIdx] {
				continue
			}
			if m[0] != 0 && m[1] != 0 && !g.stepClear(ci, cj, m[0], m[1]) {
				continue
			}
			g.Ocean[nIdx] = true
			queue = append(queue, nIdx)
		}
	}
}

func (g *Grid) navigable(idx int) bool {
	if g.Ocean != nil {
		return g.Ocean[idx]
	}
	return g.Water[idx]
}

// NearestWater snaps a port location to the closest navigable water cell
// within maxR cells. Returns -1, -1 if none found.
func (g *Grid) NearestWater(lon, lat float64, maxR int) (int, int) {
	ci, cj := g.Cell(lon, lat)
	if g.navigable(g.Idx(ci, cj)) {
		return ci, cj
	}
	for r := 1; r <= maxR; r++ {
		best, bestD := -1, math.MaxFloat64
		for dj := -r; dj <= r; dj++ {
			for di := -r; di <= r; di++ {
				if max(abs(di), abs(dj)) != r {
					continue
				}
				j := cj + dj
				if j < 0 || j >= g.H {
					continue
				}
				i := ((ci+di)%g.W + g.W) % g.W
				if !g.navigable(g.Idx(i, j)) {
					continue
				}
				d := float64(di*di + dj*dj)
				if d < bestD {
					bestD = d
					best = g.Idx(i, j)
				}
			}
		}
		if best >= 0 {
			return best % g.W, best / g.W
		}
	}
	return -1, -1
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
