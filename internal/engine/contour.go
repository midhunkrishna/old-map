package engine

import (
	"math"
	"sort"
)

// Contouring: turn the days-at-sea field into smooth isochrone polygons via
// marching squares. The field is recentered on the origin port's longitude
// so contours can cross the antimeridian without being cut (output
// longitudes may exceed ±180, which MapLibre renders correctly).

const farValue = 1e6 // land / unreachable

type ContourSet struct {
	ThresholdDays float64
	// Polygons in GeoJSON nesting: each polygon is [outer, holes...],
	// rings are [][2]float64 lon/lat.
	Polygons [][]Ring
	// LabelPoints are good spots to pin a "N days" label.
	LabelPoints [][2]float64
}

type ms struct {
	w, h    int // padded lattice dimensions
	f       []float32
	res     float64
	lonAt0  float64 // longitude of padded column 0
	latAt0  float64 // latitude of padded row 0
}

func (m *ms) val(i, j int) float32 {
	if i < 0 || j < 0 || i >= m.w || j >= m.h {
		return farValue
	}
	return m.f[j*m.w+i]
}

// BuildContours extracts closed isochrone rings for each threshold (days).
func (g *Grid) BuildContours(hours []float32, originLon float64, thresholdsDays []float64) []ContourSet {
	// Rotate the field so the origin sits at the horizontal center.
	oi, _ := g.Cell(originLon, 0)
	shift := ((oi - g.W/2) % g.W + g.W) % g.W
	w, h := g.W+2, g.H+2
	f := make([]float32, w*h)
	for k := range f {
		f[k] = farValue
	}
	for j := 0; j < g.H; j++ {
		for i := 0; i < g.W; i++ {
			v := hours[g.Idx((i+shift)%g.W, j)]
			if v >= math.MaxFloat32 {
				v = farValue
			} else {
				v /= 24 // hours → days
			}
			f[(j+1)*w+i+1] = v
		}
	}
	centerLon, _ := g.LonLat(oi, 0)
	m := &ms{
		w: w, h: h, f: f, res: g.Res,
		// padded column c center longitude: centerLon + (c-1-W/2)*res
		lonAt0: centerLon - (1+float64(g.W)/2)*g.Res,
		latAt0: 90 + 0.5*g.Res, // padded row 0 center latitude
	}

	var out []ContourSet
	for _, t := range thresholdsDays {
		rings := m.marchingSquares(t)
		cs := m.assemble(rings, t)
		cs.ThresholdDays = t
		out = append(out, cs)
	}
	return out
}

type gpt struct{ x, y float64 } // padded lattice coordinates

func (m *ms) toLonLat(p gpt) [2]float64 {
	return [2]float64{m.lonAt0 + p.x*m.res, m.latAt0 - p.y*m.res}
}

// marchingSquares returns closed rings (in lattice coords) of the level set
// f = t. The +inf padding guarantees every contour closes.
func (m *ms) marchingSquares(t float64) [][]gpt {
	type seg struct{ a, b gpt }
	var segs []seg

	interp := func(x1, y1 float64, v1 float32, x2, y2 float64, v2 float32) gpt {
		s := (t - float64(v1)) / (float64(v2) - float64(v1))
		if s < 0.001 {
			s = 0.001
		}
		if s > 0.999 {
			s = 0.999
		}
		return gpt{x1 + s*(x2-x1), y1 + s*(y2-y1)}
	}

	for j := 0; j < m.h-1; j++ {
		for i := 0; i < m.w-1; i++ {
			tl, tr := m.val(i, j), m.val(i+1, j)
			bl, br := m.val(i, j+1), m.val(i+1, j+1)
			code := 0
			if float64(tl) < t {
				code |= 8
			}
			if float64(tr) < t {
				code |= 4
			}
			if float64(br) < t {
				code |= 2
			}
			if float64(bl) < t {
				code |= 1
			}
			if code == 0 || code == 15 {
				continue
			}
			x, y := float64(i), float64(j)
			top := func() gpt { return interp(x, y, tl, x+1, y, tr) }
			right := func() gpt { return interp(x+1, y, tr, x+1, y+1, br) }
			bottom := func() gpt { return interp(x, y+1, bl, x+1, y+1, br) }
			left := func() gpt { return interp(x, y, tl, x, y+1, bl) }
			add := func(a, b gpt) { segs = append(segs, seg{a, b}) }

			switch code {
			case 1:
				add(left(), bottom())
			case 2:
				add(bottom(), right())
			case 3:
				add(left(), right())
			case 4:
				add(top(), right())
			case 5: // saddle: tr+bl inside
				center := (float64(tl) + float64(tr) + float64(bl) + float64(br)) / 4
				if center < t {
					add(left(), top())
					add(bottom(), right())
				} else {
					add(top(), right())
					add(left(), bottom())
				}
			case 6:
				add(top(), bottom())
			case 7:
				add(left(), top())
			case 8:
				add(left(), top())
			case 9:
				add(top(), bottom())
			case 10: // saddle: tl+br inside
				center := (float64(tl) + float64(tr) + float64(bl) + float64(br)) / 4
				if center < t {
					add(top(), right())
					add(left(), bottom())
				} else {
					add(left(), top())
					add(bottom(), right())
				}
			case 11:
				add(top(), right())
			case 12:
				add(left(), right())
			case 13:
				add(bottom(), right())
			case 14:
				add(left(), bottom())
			}
		}
	}

	// Chain segments into closed loops via quantized endpoint hashing.
	key := func(p gpt) uint64 {
		return uint64(int64(math.Round(p.x*2048)))<<32 | uint64(uint32(int32(math.Round(p.y*2048))))
	}
	adj := make(map[uint64][]int32, len(segs)*2)
	for si, s := range segs {
		adj[key(s.a)] = append(adj[key(s.a)], int32(si))
		adj[key(s.b)] = append(adj[key(s.b)], int32(si))
	}
	used := make([]bool, len(segs))
	var rings [][]gpt
	for start := range segs {
		if used[start] {
			continue
		}
		used[start] = true
		ring := []gpt{segs[start].a, segs[start].b}
		cur := segs[start].b
		startKey := key(segs[start].a)
		for {
			k := key(cur)
			if k == startKey {
				break
			}
			next := int32(-1)
			for _, si := range adj[k] {
				if !used[si] {
					next = si
					break
				}
			}
			if next < 0 {
				break // open chain (shouldn't happen with padding); drop later
			}
			used[next] = true
			s := segs[next]
			if key(s.a) == k {
				cur = s.b
			} else {
				cur = s.a
			}
			ring = append(ring, cur)
		}
		if len(ring) >= 4 && key(ring[len(ring)-1]) == startKey {
			rings = append(rings, ring[:len(ring)-1]) // drop duplicate closing pt
		}
	}
	return rings
}

// assemble classifies rings as outers (enclosing the reached region) or
// holes, nests holes inside their smallest containing outer, smooths, and
// converts to lon/lat.
func (m *ms) assemble(rings [][]gpt, t float64) ContourSet {
	type ringInfo struct {
		pts   []gpt
		area  float64
		outer bool
	}
	infos := make([]ringInfo, 0, len(rings))
	for _, r := range rings {
		if len(r) < 4 {
			continue
		}
		area := ringArea(r)
		if math.Abs(area) < 0.4 { // sub-cell specks
			continue
		}
		// A ring is an outer boundary if the field at a point inside it is
		// below the threshold (the reached region lies within), and a hole
		// if the interior is above (an island or unreached pocket).
		ip := interiorPoint(r)
		infos = append(infos, ringInfo{pts: r, area: math.Abs(area), outer: m.sample(ip) < t})
	}

	cs := ContourSet{}
	type polyAcc struct {
		outer []gpt
		holes [][]gpt
		area  float64
	}
	var polys []*polyAcc
	for i := range infos {
		if infos[i].outer {
			polys = append(polys, &polyAcc{outer: infos[i].pts, area: infos[i].area})
		}
	}
	for i := range infos {
		if infos[i].outer {
			continue
		}
		h := infos[i].pts
		var best *polyAcc
		for _, p := range polys {
			if p.area > infos[i].area && pointInRing(h[0], p.outer) {
				if best == nil || p.area < best.area {
					best = p
				}
			}
		}
		if best != nil {
			best.holes = append(best.holes, h)
		}
	}

	for _, p := range polys {
		poly := []Ring{m.finishRing(p.outer)}
		for _, h := range p.holes {
			poly = append(poly, m.finishRing(h))
		}
		cs.Polygons = append(cs.Polygons, poly)
		if p.area > 12 && len(p.outer) > 8 {
			cs.LabelPoints = append(cs.LabelPoints,
				m.toLonLat(chaikin(p.outer)[len(p.outer)/4]),
				m.toLonLat(chaikin(p.outer)[3*len(p.outer)/4]))
		}
	}
	return cs
}

// interiorPoint returns a point well inside a closed ring: the midpoint of
// the first crossing interval of a horizontal line through the ring's
// vertical middle.
func interiorPoint(r []gpt) gpt {
	minY, maxY := r[0].y, r[0].y
	for _, p := range r {
		minY = math.Min(minY, p.y)
		maxY = math.Max(maxY, p.y)
	}
	y := (minY + maxY) / 2
	var xs []float64
	n := len(r)
	for i := 0; i < n; i++ {
		a, b := r[i], r[(i+1)%n]
		if (a.y <= y && b.y > y) || (b.y <= y && a.y > y) {
			s := (y - a.y) / (b.y - a.y)
			xs = append(xs, a.x+s*(b.x-a.x))
		}
	}
	sort.Float64s(xs)
	if len(xs) >= 2 {
		return gpt{(xs[0] + xs[1]) / 2, y}
	}
	return r[0]
}

// finishRing smooths a lattice-space ring and converts it to a closed
// lon/lat GeoJSON ring.
func (m *ms) finishRing(r []gpt) Ring {
	s := chaikin(r)
	out := make(Ring, 0, len(s)+1)
	for _, p := range s {
		out = append(out, m.toLonLat(p))
	}
	out = append(out, out[0])
	return out
}

// chaikin performs one iteration of corner-cutting on a closed ring.
func chaikin(r []gpt) []gpt {
	n := len(r)
	out := make([]gpt, 0, 2*n)
	for i := 0; i < n; i++ {
		p, q := r[i], r[(i+1)%n]
		out = append(out,
			gpt{0.75*p.x + 0.25*q.x, 0.75*p.y + 0.25*q.y},
			gpt{0.25*p.x + 0.75*q.x, 0.25*p.y + 0.75*q.y})
	}
	return out
}

func ringArea(r []gpt) float64 {
	a := 0.0
	n := len(r)
	for i := 0; i < n; i++ {
		j := (i + 1) % n
		a += r[i].x*r[j].y - r[j].x*r[i].y
	}
	return a / 2
}

func pointInRing(p gpt, r []gpt) bool {
	in := false
	n := len(r)
	for i, j := 0, n-1; i < n; j, i = i, i+1 {
		if (r[i].y > p.y) != (r[j].y > p.y) &&
			p.x < (r[j].x-r[i].x)*(p.y-r[i].y)/(r[j].y-r[i].y)+r[i].x {
			in = !in
		}
	}
	return in
}

// sample bilinearly interpolates the padded field at lattice coords.
func (m *ms) sample(p gpt) float64 {
	x0, y0 := int(math.Floor(p.x)), int(math.Floor(p.y))
	fx, fy := p.x-float64(x0), p.y-float64(y0)
	v00 := float64(m.val(x0, y0))
	v10 := float64(m.val(x0+1, y0))
	v01 := float64(m.val(x0, y0+1))
	v11 := float64(m.val(x0+1, y0+1))
	return v00*(1-fx)*(1-fy) + v10*fx*(1-fy) + v01*(1-fx)*fy + v11*fx*fy
}
