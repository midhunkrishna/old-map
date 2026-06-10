//go:build js && wasm

// Command wasm is the browser build of the sailing engine. It loads the
// precomputed navigable grid (grid.bin) once, then answers isochrone and
// route queries on demand — the only two operations that need per-request
// compute. Every other endpoint of the original server is a pure function of
// the model and is shipped as static JSON instead.
package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"

	"oldmap/internal/engine"
)

var (
	grid       *engine.Grid
	portByID   map[string]port
	thresholds = engine.DefaultThresholds
)

type port struct {
	ID  string  `json:"id"`
	Lon float64 `json:"lon"`
	Lat float64 `json:"lat"`
}

func main() {
	js.Global().Set("oldmapInit", js.FuncOf(oldmapInit))
	js.Global().Set("oldmapIsochrone", js.FuncOf(oldmapIsochrone))
	js.Global().Set("oldmapRoute", js.FuncOf(oldmapRoute))
	js.Global().Set("oldmapReady", js.ValueOf(true))
	select {} // keep the Go runtime (and the callbacks) alive
}

// result packs an (HTTP-style status, body) pair into a JS array so the
// client shim can mimic fetch's ok/status without re-encoding large bodies.
func result(status int, body string) any {
	arr := js.Global().Get("Array").New(2)
	arr.SetIndex(0, status)
	arr.SetIndex(1, body)
	return arr
}

// oldmapInit(gridBytes Uint8Array, metaJSON string) loads the grid and port
// table. Returns "" on success or an error message.
func oldmapInit(_ js.Value, args []js.Value) any {
	if len(args) < 2 {
		return "oldmapInit(gridBytes, metaJSON) requires 2 args"
	}
	buf := make([]byte, args[0].Get("length").Int())
	js.CopyBytesToGo(buf, args[0])
	g, err := engine.LoadGrid(buf)
	if err != nil {
		return "grid load: " + err.Error()
	}
	grid = g

	var meta struct {
		Thresholds []float64 `json:"thresholds"`
		Ports      []port    `json:"ports"`
	}
	if err := json.Unmarshal([]byte(args[1].String()), &meta); err != nil {
		return "meta parse: " + err.Error()
	}
	if len(meta.Thresholds) > 0 {
		thresholds = meta.Thresholds
	}
	portByID = make(map[string]port, len(meta.Ports))
	for _, p := range meta.Ports {
		portByID[p.ID] = p
	}
	return ""
}

// oldmapIsochrone(specJSON) returns [status, geojson]. spec is either
// {"port":"id"} or {"lon":..,"lat":..}.
func oldmapIsochrone(_ js.Value, args []js.Value) any {
	if grid == nil {
		return result(503, `{"error":"engine not initialized"}`)
	}
	var spec struct {
		Port string   `json:"port"`
		Lon  *float64 `json:"lon"`
		Lat  *float64 `json:"lat"`
	}
	if len(args) < 1 || json.Unmarshal([]byte(args[0].String()), &spec) != nil {
		return result(400, `{"error":"bad request"}`)
	}

	if spec.Port != "" {
		p, ok := portByID[spec.Port]
		if !ok {
			return result(404, `{"error":"unknown port"}`)
		}
		ci, cj := grid.NearestWater(p.Lon, p.Lat, 12)
		if ci < 0 {
			return result(200, `{"type":"FeatureCollection","features":[]}`)
		}
		return result(200, string(grid.IsochroneJSON(ci, cj, p.Lon, p.ID, thresholds)))
	}

	if spec.Lon == nil || spec.Lat == nil {
		return result(400, `{"error":"need port or lon/lat"}`)
	}
	// Small snap radius (~0.6°) so deep-inland clicks are rejected.
	ci, cj := grid.NearestWater(*spec.Lon, *spec.Lat, 4)
	if ci < 0 {
		return result(422, `{"error":"land"}`)
	}
	originLon, _ := grid.LonLat(ci, cj)
	id := fmt.Sprintf("pt_%d_%d", ci, cj)
	return result(200, string(grid.IsochroneJSON(ci, cj, originLon, id, thresholds)))
}

// oldmapRoute(fromLon, fromLat, toLon, toLat) returns [status, geojson].
func oldmapRoute(_ js.Value, args []js.Value) any {
	if grid == nil {
		return result(503, `{"error":"engine not initialized"}`)
	}
	if len(args) < 4 {
		return result(400, `{"error":"need from/to lon,lat"}`)
	}
	fromLon, fromLat := args[0].Float(), args[1].Float()
	toLon, toLat := args[2].Float(), args[3].Float()

	i1, j1 := grid.NearestWater(fromLon, fromLat, 12)
	i2, j2 := grid.NearestWater(toLon, toLat, 12)
	if i1 < 0 || i2 < 0 {
		return result(422, `{"error":"land"}`)
	}
	if i1 == i2 && j1 == j2 {
		lon, lat := grid.LonLat(i1, j1)
		b := grid.RouteJSON([][2]float64{{lon, lat}, {lon, lat}}, []float32{0, 0}, i1, j1, i2, j2)
		return result(200, string(b))
	}
	coords, hours, ok := grid.SailRoute(i1, j1, i2, j2)
	if !ok {
		return result(422, `{"error":"unreachable"}`)
	}
	return result(200, string(grid.RouteJSON(coords, hours, i1, j1, i2, j2)))
}
