package engine

import (
	"encoding/json"
	"fmt"
	"os"
)

// Minimal GeoJSON reader for Natural Earth land polygons.

type featureCollection struct {
	Type     string    `json:"type"`
	Features []feature `json:"features"`
}

type feature struct {
	Type     string   `json:"type"`
	Geometry geometry `json:"geometry"`
}

type geometry struct {
	Type        string          `json:"type"`
	Coordinates json.RawMessage `json:"coordinates"`
}

// Ring is a closed sequence of [lon, lat] positions.
type Ring [][2]float64

// LoadLandRings reads every polygon ring (outer and holes) from a GeoJSON
// file. Even-odd scanline filling makes the outer/hole distinction moot.
func LoadLandRings(path string) ([]Ring, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var fc featureCollection
	if err := json.Unmarshal(raw, &fc); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	var rings []Ring
	addPoly := func(poly [][][]float64) {
		for _, r := range poly {
			ring := make(Ring, 0, len(r))
			for _, pt := range r {
				if len(pt) >= 2 {
					ring = append(ring, [2]float64{pt[0], pt[1]})
				}
			}
			if len(ring) >= 4 {
				rings = append(rings, ring)
			}
		}
	}
	for _, f := range fc.Features {
		switch f.Geometry.Type {
		case "Polygon":
			var poly [][][]float64
			if err := json.Unmarshal(f.Geometry.Coordinates, &poly); err != nil {
				return nil, err
			}
			addPoly(poly)
		case "MultiPolygon":
			var mp [][][][]float64
			if err := json.Unmarshal(f.Geometry.Coordinates, &mp); err != nil {
				return nil, err
			}
			for _, poly := range mp {
				addPoly(poly)
			}
		}
	}
	return rings, nil
}
