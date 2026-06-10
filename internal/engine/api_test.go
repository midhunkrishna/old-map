package engine

import (
	"bytes"
	"testing"
)

// buildTestGrid builds the same grid the server builds, from the 50m land
// rings, so tests exercise the real navigable mask.
func buildTestGrid(t *testing.T) *Grid {
	t.Helper()
	rings, err := LoadLandRings("../../data/land/ne_50m_land.geojson")
	if err != nil {
		t.Fatalf("load land rings: %v", err)
	}
	g := NewGrid(0.15)
	g.BuildLandMask(rings)
	g.MarkOcean(-40, 35)
	return g
}

func TestGridBinaryRoundTrip(t *testing.T) {
	g := buildTestGrid(t)
	rt, err := LoadGrid(g.MarshalBinary())
	if err != nil {
		t.Fatalf("LoadGrid: %v", err)
	}
	if rt.W != g.W || rt.H != g.H || rt.Res != g.Res {
		t.Fatalf("dims mismatch: %dx%d@%.3f vs %dx%d@%.3f", rt.W, rt.H, rt.Res, g.W, g.H, g.Res)
	}
	for i := range g.Water {
		if g.Water[i] != rt.Water[i] {
			t.Fatalf("water bit %d differs", i)
		}
	}
	if (g.Ocean == nil) != (rt.Ocean == nil) {
		t.Fatalf("ocean nilness differs: %v vs %v", g.Ocean == nil, rt.Ocean == nil)
	}
	for i := range g.Ocean {
		if g.Ocean[i] != rt.Ocean[i] {
			t.Fatalf("ocean bit %d differs", i)
		}
	}
}

// TestIsochroneAfterReload proves the reloaded grid yields byte-identical
// isochrone GeoJSON — i.e. the WASM client and the server compute the same
// answer for the same origin.
func TestIsochroneAfterReload(t *testing.T) {
	g := buildTestGrid(t)
	rt, err := LoadGrid(g.MarshalBinary())
	if err != nil {
		t.Fatalf("LoadGrid: %v", err)
	}
	// Lisbon-ish open water.
	ci, cj := g.NearestWater(-9.5, 38.7, 12)
	if ci < 0 {
		t.Fatal("no water near origin")
	}
	originLon, _ := g.LonLat(ci, cj)
	a := g.IsochroneJSON(ci, cj, originLon, "test", DefaultThresholds)
	b := rt.IsochroneJSON(ci, cj, originLon, "test", DefaultThresholds)
	if !bytes.Equal(a, b) {
		t.Fatalf("isochrone differs after reload: %d vs %d bytes", len(a), len(b))
	}
	if len(a) < 100 {
		t.Fatalf("isochrone suspiciously small: %d bytes", len(a))
	}
}
