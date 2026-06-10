package engine

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"sort"
)

// DefaultThresholds is the set of sailing-time isochrone bands, in days.
var DefaultThresholds = []float64{7, 14, 21, 30, 45, 60, 90, 120, 150, 180}

// IsochroneJSON returns a GeoJSON FeatureCollection of filled time-bands
// (sorted outermost first), contour lines, and label anchor points for an
// origin at grid cell (ci, cj). originLon is used to unwrap longitudes and
// id labels the collection. This is the single source of truth shared by the
// HTTP server and the WASM build.
func (g *Grid) IsochroneJSON(ci, cj int, originLon float64, id string, thresholds []float64) []byte {
	hours := g.SailTimes(ci, cj)
	sets := g.BuildContours(hours, originLon, thresholds)

	// Outermost band first so the client can stack opaque fills.
	sort.Slice(sets, func(a, b int) bool { return sets[a].ThresholdDays > sets[b].ThresholdDays })

	var features []map[string]any
	for _, cs := range sets {
		if len(cs.Polygons) == 0 {
			continue
		}
		coords := make([][][][2]float64, 0, len(cs.Polygons))
		for _, poly := range cs.Polygons {
			p := make([][][2]float64, 0, len(poly))
			for _, ring := range poly {
				p = append(p, Dedup(ring))
			}
			coords = append(coords, p)
		}
		features = append(features, map[string]any{
			"type":       "Feature",
			"properties": map[string]any{"kind": "band", "days": cs.ThresholdDays},
			"geometry":   map[string]any{"type": "MultiPolygon", "coordinates": coords},
		})
		for _, poly := range cs.Polygons {
			features = append(features, map[string]any{
				"type":       "Feature",
				"properties": map[string]any{"kind": "line", "days": cs.ThresholdDays},
				"geometry":   map[string]any{"type": "LineString", "coordinates": Dedup(poly[0])},
			})
		}
		for _, lp := range cs.LabelPoints {
			features = append(features, map[string]any{
				"type":       "Feature",
				"properties": map[string]any{"kind": "label", "days": cs.ThresholdDays},
				"geometry":   map[string]any{"type": "Point", "coordinates": lp},
			})
		}
	}
	out := map[string]any{
		"type":     "FeatureCollection",
		"port":     id,
		"features": features,
	}
	b, _ := json.Marshal(out)
	return b
}

// RouteJSON returns the time-optimal track between grid cells (i1,j1) and
// (i2,j2) as a GeoJSON LineString Feature with cumulative hours per vertex.
func (g *Grid) RouteJSON(coords [][2]float64, hours []float32, i1, j1, i2, j2 int) []byte {
	nm := TrackLengthNM(coords)
	for k := range coords {
		coords[k][0] = math.Round(coords[k][0]*1e4) / 1e4
		coords[k][1] = math.Round(coords[k][1]*1e4) / 1e4
	}
	fromLon, fromLat := g.LonLat(i1, j1)
	toLon, toLat := g.LonLat(i2, j2)
	fromLon, fromLat = math.Round(fromLon*1e4)/1e4, math.Round(fromLat*1e4)/1e4
	toLon, toLat = math.Round(toLon*1e4)/1e4, math.Round(toLat*1e4)/1e4
	days := math.Round(float64(hours[len(hours)-1])/24*10) / 10
	out := map[string]any{
		"type": "Feature",
		"geometry": map[string]any{
			"type":        "LineString",
			"coordinates": coords,
		},
		"properties": map[string]any{
			"hours": hours,
			"days":  days,
			"nm":    math.Round(nm),
			"from":  [2]float64{fromLon, fromLat},
			"to":    [2]float64{toLon, toLat},
		},
	}
	b, _ := json.Marshal(out)
	return b
}

// Dedup rounds coordinates and removes consecutive duplicates to shrink
// payloads.
func Dedup(r Ring) [][2]float64 {
	out := make([][2]float64, 0, len(r))
	var last [2]float64
	for k, pt := range r {
		pt[0] = math.Round(pt[0]*1e4) / 1e4
		pt[1] = math.Round(pt[1]*1e4) / 1e4
		if k > 0 && pt == last {
			continue
		}
		out = append(out, pt)
		last = pt
	}
	return out
}

// gridMagic identifies the binary grid format; the trailing byte is the
// format version.
var gridMagic = [4]byte{'O', 'M', 'G', 1}

// MarshalBinary serializes the navigable grid (dimensions, resolution, and
// the Water + Ocean masks as packed bits) for shipping to the WASM client.
// Layout: magic[4] | W int32 | H int32 | Res float64 | water bits | ocean bits.
func (g *Grid) MarshalBinary() []byte {
	n := g.W * g.H
	nbytes := (n + 7) / 8
	buf := make([]byte, 0, 4+4+4+8+2*nbytes)
	buf = append(buf, gridMagic[:]...)
	buf = binary.LittleEndian.AppendUint32(buf, uint32(g.W))
	buf = binary.LittleEndian.AppendUint32(buf, uint32(g.H))
	buf = binary.LittleEndian.AppendUint64(buf, math.Float64bits(g.Res))
	buf = appendBits(buf, g.Water, nbytes)
	// Ocean may be nil if MarkOcean was never called; emit an all-zero block
	// of the same size so the reader can detect "no ocean mask".
	if g.Ocean != nil {
		buf = appendBits(buf, g.Ocean, nbytes)
	} else {
		buf = append(buf, make([]byte, nbytes)...)
	}
	return buf
}

func appendBits(buf []byte, bits []bool, nbytes int) []byte {
	packed := make([]byte, nbytes)
	for i, v := range bits {
		if v {
			packed[i>>3] |= 1 << uint(i&7)
		}
	}
	return append(buf, packed...)
}

// LoadGrid reconstructs a Grid from MarshalBinary output. The Ocean mask is
// left nil when the stored block is entirely zero (grid had no ocean fill).
func LoadGrid(b []byte) (*Grid, error) {
	if len(b) < 20 || [4]byte{b[0], b[1], b[2], b[3]} != gridMagic {
		return nil, fmt.Errorf("bad grid header")
	}
	w := int(binary.LittleEndian.Uint32(b[4:8]))
	h := int(binary.LittleEndian.Uint32(b[8:12]))
	res := math.Float64frombits(binary.LittleEndian.Uint64(b[12:20]))
	n := w * h
	nbytes := (n + 7) / 8
	if len(b) < 20+2*nbytes {
		return nil, fmt.Errorf("grid truncated: have %d need %d", len(b), 20+2*nbytes)
	}
	g := &Grid{W: w, H: h, Res: res, Water: make([]bool, n)}
	readBits(b[20:20+nbytes], g.Water)
	ocean := make([]bool, n)
	any := readBits(b[20+nbytes:20+2*nbytes], ocean)
	if any {
		g.Ocean = ocean
	}
	return g, nil
}

func readBits(packed []byte, out []bool) (any bool) {
	for i := range out {
		if packed[i>>3]&(1<<uint(i&7)) != 0 {
			out[i] = true
			any = true
		}
	}
	return any
}
