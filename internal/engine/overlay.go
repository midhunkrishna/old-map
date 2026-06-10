package engine

import "math"

// Pilot-chart style overlay geometry: the annual-mean wind system and the
// major surface currents rendered as arrow glyphs in geographic coordinates,
// for the frontend's "winds" and "currents" overlays. Arrows are generated
// only over navigable ocean so they read as chart annotations, not a raster.

// arrow builds a MultiLineString (shaft + two head barbs) centered on
// (lon, lat), pointing toward bearing degTo, with total length lenDeg
// degrees of latitude. Longitudes are stretched by 1/cos(lat) so arrows look
// the same size on a mercator chart at any latitude.
func arrow(lon, lat, degTo, lenDeg float64) [][][2]float64 {
	rad := degTo * math.Pi / 180
	cs := math.Cos(lat * math.Pi / 180)
	if cs < 0.2 {
		cs = 0.2
	}
	dx := math.Sin(rad) * lenDeg / 2 / cs
	dy := math.Cos(rad) * lenDeg / 2
	tail := [2]float64{lon - dx, lat - dy}
	tip := [2]float64{lon + dx, lat + dy}
	headLen := lenDeg * 0.32
	barb := func(offset float64) [2]float64 {
		a := rad + math.Pi + offset
		return [2]float64{
			tip[0] + math.Sin(a)*headLen/cs,
			tip[1] + math.Cos(a)*headLen,
		}
	}
	return [][][2]float64{
		{tail, tip},
		{barb(0.45), tip, barb(-0.45)},
	}
}

// NavigableAt reports whether the cell containing (lon, lat) is open,
// connected ocean — the same water the router sails. Used by the frontend's
// flow-field mask.
func (g *Grid) NavigableAt(lon, lat float64) bool {
	i, j := g.Cell(lon, lat)
	if i < 0 || j < 0 || i >= g.W || j >= g.H {
		return false
	}
	return g.navigable(g.Idx(i, j))
}

// WindFeatures samples the wind model on a step° lattice over open ocean.
// Directed belts become arrows (pointing downwind); doldrums and variables
// become "calm" points the frontend can stipple.
func (g *Grid) WindFeatures(step float64) []map[string]any {
	var feats []map[string]any
	for lat := -60.0; lat <= 64.0; lat += step {
		for lon := -180 + step/2; lon < 180; lon += step {
			i, j := g.Cell(lon, lat)
			if i < 0 || j < 0 || i >= g.W || j >= g.H || !g.navigable(g.Idx(i, j)) {
				continue
			}
			from, strength, directed := WindAt(lon, lat)
			if !directed {
				feats = append(feats, map[string]any{
					"type":       "Feature",
					"properties": map[string]any{"kind": "calm", "strength": strength},
					"geometry":   map[string]any{"type": "Point", "coordinates": [2]float64{lon, lat}},
				})
				continue
			}
			length := step * (0.32 + 0.22*strength)
			feats = append(feats, map[string]any{
				"type":       "Feature",
				"properties": map[string]any{"kind": "wind", "strength": strength},
				"geometry": map[string]any{
					"type":        "MultiLineString",
					"coordinates": arrow(lon, lat, from+180, length),
				},
			})
		}
	}
	return feats
}

// CurrentFeatures renders each named surface current as arrows sampled
// inside its box, sized by drift speed.
func (g *Grid) CurrentFeatures() []map[string]any {
	var feats []map[string]any
	for _, c := range currents {
		step := 2.5
		for lat := c.latMin + step/2; lat < c.latMax; lat += step {
			for lon := c.lonMin + step/2; lon < c.lonMax; lon += step {
				i, j := g.Cell(lon, lat)
				if i < 0 || j < 0 || i >= g.W || j >= g.H || !g.navigable(g.Idx(i, j)) {
					continue
				}
				feats = append(feats, map[string]any{
					"type":       "Feature",
					"properties": map[string]any{"kind": "current", "name": c.name, "kn": c.kn},
					"geometry": map[string]any{
						"type":        "MultiLineString",
						"coordinates": arrow(lon, lat, c.dirTo, 1.0+0.8*c.kn),
					},
				})
			}
		}
	}
	return feats
}
