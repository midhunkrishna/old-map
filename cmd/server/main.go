package main

import (
	"container/list"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"oldmap/internal/engine"
)

var thresholds = engine.DefaultThresholds

type Port struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Lat        float64  `json:"lat"`
	Lon        float64  `json:"lon"`
	Nation     string   `json:"nation"`
	Kinds      []string `json:"kinds"`
	Tier       int      `json:"tier"`
	Pirate     bool     `json:"pirate"`
	Blurb      string   `json:"blurb"`
	Detail     string   `json:"detail,omitempty"`
	Population string   `json:"population,omitempty"`
	Defenses   string   `json:"defenses,omitempty"`
	Trade      string   `json:"trade,omitempty"`
	Events     []string `json:"events,omitempty"`
}

type Passage struct {
	From        string  `json:"from"`
	To          string  `json:"to"`
	DaysTypical float64 `json:"days_typical"`
	DaysLow     float64 `json:"days_low"`
	DaysHigh    float64 `json:"days_high"`
	Source      string  `json:"source"`
}

type server struct {
	root     string
	grid     *engine.Grid
	ports    []Port
	portByID map[string]Port

	mu         sync.Mutex
	isoCache   map[string][]byte // port isochrones, pinned for process life
	ptCache    *lruCache         // point isochrones (disk copy survives eviction)
	routeCache *lruCache         // routes, memory only
	building   map[string]chan struct{}

	calOnce sync.Once
	calRows []calRow
	calErr  error
}

func main() {
	addr := flag.String("addr", "127.0.0.1:8047", "listen address")
	calibrate := flag.Bool("calibrate", false, "print model-vs-history calibration table and exit")
	export := flag.String("export", "", "write static client artifacts (grid.bin + *.json) to dir and exit")
	res := flag.Float64("res", 0.15, "ocean grid resolution in degrees")
	flag.Parse()

	root, err := projectRoot()
	if err != nil {
		log.Fatal(err)
	}

	t0 := time.Now()
	rings, err := engine.LoadLandRings(filepath.Join(root, "data/land/ne_50m_land.geojson"))
	if err != nil {
		log.Fatal(err)
	}
	grid := engine.NewGrid(*res)
	grid.BuildLandMask(rings)
	grid.MarkOcean(-40, 35) // seed in the open North Atlantic
	water := 0
	for _, w := range grid.Water {
		if w {
			water++
		}
	}
	log.Printf("ocean grid %dx%d at %.2f° (%d water cells) built in %s",
		grid.W, grid.H, *res, water, time.Since(t0).Round(time.Millisecond))

	s := &server{
		root:       root,
		grid:       grid,
		portByID:   map[string]Port{},
		isoCache:   map[string][]byte{},
		ptCache:    newLRU(40),
		routeCache: newLRU(200),
		building:   map[string]chan struct{}{},
	}
	if err := loadJSON(filepath.Join(root, "data/ports.json"), &s.ports); err != nil {
		log.Fatal(err)
	}
	for _, p := range s.ports {
		s.portByID[p.ID] = p
	}
	log.Printf("%d ports loaded", len(s.ports))

	if *calibrate {
		s.runCalibration(os.Stdout)
		return
	}

	if *export != "" {
		if err := s.exportStatic(*export); err != nil {
			log.Fatal(err)
		}
		return
	}

	// Warm the isochrone cache in the background so port picks are instant.
	// Goes through the same single-flight path as the HTTP handler so a
	// user request during warm-up never duplicates a build.
	go func() {
		for _, p := range s.ports {
			s.isochrone(p.ID)
		}
		log.Printf("isochrone cache warm for all %d ports", len(s.ports))
	}()

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.Dir(filepath.Join(root, "web"))))
	mux.Handle("/data/", http.StripPrefix("/data/", http.FileServer(http.Dir(filepath.Join(root, "data")))))
	mux.HandleFunc("/api/meta", s.handleMeta)
	mux.HandleFunc("/api/isochrone", s.handleIsochrone)
	mux.HandleFunc("/api/route", s.handleRoute)
	mux.HandleFunc("/api/calibration", s.handleCalibration)
	mux.HandleFunc("/api/wind", s.handleWind)
	mux.HandleFunc("/api/currents", s.handleCurrents)
	mux.HandleFunc("/api/flowmask", s.handleFlowMask)

	log.Printf("Carta Temporum listening on http://%s", *addr)
	log.Fatal(http.ListenAndServe(*addr, mux))
}

func projectRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for d := dir; ; d = filepath.Dir(d) {
		if _, err := os.Stat(filepath.Join(d, "go.mod")); err == nil {
			return d, nil
		}
		if filepath.Dir(d) == d {
			return dir, nil
		}
	}
}

func loadJSON(path string, v any) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, v)
}

func (s *server) handleMeta(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{
		"thresholds": thresholds,
		"ports":      s.ports,
	})
}

// handleIsochrone returns a GeoJSON FeatureCollection of filled time-bands
// (sorted outermost first), contour lines, and label anchor points. The
// origin is either a known port (?port=id) or an arbitrary sea point
// (?lon=&lat=), snapped to nearby navigable water.
func (s *server) handleIsochrone(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if id := q.Get("port"); id != "" {
		if _, ok := s.portByID[id]; !ok {
			http.Error(w, "unknown port", http.StatusNotFound)
			return
		}
		writeJSONBytes(w, s.isochrone(id))
		return
	}

	lon, err1 := strconv.ParseFloat(q.Get("lon"), 64)
	lat, err2 := strconv.ParseFloat(q.Get("lat"), 64)
	if err1 != nil || err2 != nil {
		writeJSONError(w, http.StatusBadRequest, "need port=<id> or lon=<deg>&lat=<deg>")
		return
	}
	// Small snap radius (~0.6°) so deep-inland clicks are rejected.
	ci, cj := s.grid.NearestWater(lon, lat, 4)
	if ci < 0 {
		writeJSONError(w, http.StatusUnprocessableEntity, "land")
		return
	}
	key := fmt.Sprintf("pt_%d_%d", ci, cj)
	b := s.withCache(key,
		func() ([]byte, bool) { return s.ptCache.get(key) },
		func(b []byte) { s.ptCache.put(key, b) },
		func() []byte { return s.loadOrBuildIsochroneAt(ci, cj) })
	writeJSONBytes(w, b)
}

// isochrone returns the cached GeoJSON for a port, building it at most once
// across all callers (HTTP handlers and the warm-up goroutine).
func (s *server) isochrone(id string) []byte {
	return s.withCache(id,
		func() ([]byte, bool) { b, ok := s.isoCache[id]; return b, ok },
		func(b []byte) { s.isoCache[id] = b },
		func() []byte { return s.loadOrBuildIsochrone(s.portByID[id]) })
}

// withCache returns the cached value for key, building it at most once
// across all concurrent callers (single-flight). lookup and store run with
// s.mu held; build runs unlocked. Keys are namespaced (port ids, "pt_…",
// "route_…") so a single building map serves every cache.
func (s *server) withCache(key string, lookup func() ([]byte, bool), store func([]byte), build func() []byte) []byte {
	for {
		s.mu.Lock()
		if b, ok := lookup(); ok {
			s.mu.Unlock()
			return b
		}
		ch, busy := s.building[key]
		if !busy {
			ch = make(chan struct{})
			s.building[key] = ch
			s.mu.Unlock()

			b := build()

			s.mu.Lock()
			store(b)
			delete(s.building, key)
			close(ch)
			s.mu.Unlock()
			return b
		}
		s.mu.Unlock()
		<-ch // builder finished; re-check (entry may have been evicted)
	}
}

// lruCache is a minimal LRU of JSON blobs. Not safe for concurrent use;
// callers hold s.mu.
type lruCache struct {
	cap int
	ll  *list.List // front = most recently used
	m   map[string]*list.Element
}

type lruEntry struct {
	key string
	val []byte
}

func newLRU(capacity int) *lruCache {
	return &lruCache{cap: capacity, ll: list.New(), m: map[string]*list.Element{}}
}

func (c *lruCache) get(key string) ([]byte, bool) {
	el, ok := c.m[key]
	if !ok {
		return nil, false
	}
	c.ll.MoveToFront(el)
	return el.Value.(*lruEntry).val, true
}

func (c *lruCache) put(key string, val []byte) {
	if el, ok := c.m[key]; ok {
		el.Value.(*lruEntry).val = val
		c.ll.MoveToFront(el)
		return
	}
	c.m[key] = c.ll.PushFront(&lruEntry{key, val})
	for c.ll.Len() > c.cap {
		old := c.ll.Back()
		c.ll.Remove(old)
		delete(c.m, old.Value.(*lruEntry).key)
	}
}

func (s *server) loadOrBuildIsochrone(port Port) []byte {
	cachePath := filepath.Join(s.root, "data/cache",
		fmt.Sprintf("iso_%s_r%g.json", port.ID, s.grid.Res))
	if b, err := os.ReadFile(cachePath); err == nil {
		return b
	}
	t0 := time.Now()
	b := s.buildIsochrone(port)
	_ = os.MkdirAll(filepath.Dir(cachePath), 0o755)
	_ = os.WriteFile(cachePath, b, 0o644)
	log.Printf("isochrone %s computed in %s (%d bytes)", port.ID, time.Since(t0).Round(time.Millisecond), len(b))
	return b
}

func (s *server) loadOrBuildIsochroneAt(ci, cj int) []byte {
	cachePath := filepath.Join(s.root, "data/cache",
		fmt.Sprintf("iso_pt_%d_%d_r%g.json", ci, cj, s.grid.Res))
	if b, err := os.ReadFile(cachePath); err == nil {
		return b
	}
	t0 := time.Now()
	lon, lat := s.grid.LonLat(ci, cj)
	b := s.buildIsochroneAt(lon, lat)
	_ = os.MkdirAll(filepath.Dir(cachePath), 0o755)
	_ = os.WriteFile(cachePath, b, 0o644)
	log.Printf("isochrone pt_%d_%d computed in %s (%d bytes)", ci, cj, time.Since(t0).Round(time.Millisecond), len(b))
	return b
}

func (s *server) buildIsochrone(port Port) []byte {
	ci, cj := s.grid.NearestWater(port.Lon, port.Lat, 12)
	if ci < 0 {
		return []byte(`{"type":"FeatureCollection","features":[]}`)
	}
	return s.grid.IsochroneJSON(ci, cj, port.Lon, port.ID, thresholds)
}

// buildIsochroneAt builds the isochrone FeatureCollection for an arbitrary
// sea point, snapped within ~0.6° of navigable water.
func (s *server) buildIsochroneAt(lon, lat float64) []byte {
	ci, cj := s.grid.NearestWater(lon, lat, 4)
	if ci < 0 {
		return []byte(`{"type":"FeatureCollection","features":[]}`)
	}
	originLon, _ := s.grid.LonLat(ci, cj)
	return s.grid.IsochroneJSON(ci, cj, originLon, fmt.Sprintf("pt_%d_%d", ci, cj), thresholds)
}

// handleRoute returns the time-optimal sailing track between two sea points
// as a GeoJSON LineString Feature with cumulative hours per vertex.
func (s *server) handleRoute(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	fromLon, fromLat, err := parseLonLat(q.Get("from"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "from: "+err.Error())
		return
	}
	toLon, toLat, err := parseLonLat(q.Get("to"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "to: "+err.Error())
		return
	}
	i1, j1 := s.grid.NearestWater(fromLon, fromLat, 12)
	i2, j2 := s.grid.NearestWater(toLon, toLat, 12)
	if i1 < 0 || i2 < 0 {
		writeJSONError(w, http.StatusUnprocessableEntity, "land")
		return
	}
	if i1 == i2 && j1 == j2 {
		lon, lat := s.grid.LonLat(i1, j1)
		writeJSONBytes(w, s.grid.RouteJSON(
			[][2]float64{{lon, lat}, {lon, lat}}, []float32{0, 0}, i1, j1, i2, j2))
		return
	}
	key := fmt.Sprintf("route_%d_%d_%d_%d", i1, j1, i2, j2)
	b := s.withCache(key,
		func() ([]byte, bool) { return s.routeCache.get(key) },
		func(b []byte) { s.routeCache.put(key, b) },
		func() []byte { return s.buildRoute(i1, j1, i2, j2) })
	if b == nil { // cached "unreachable"
		writeJSONError(w, http.StatusUnprocessableEntity, "unreachable")
		return
	}
	writeJSONBytes(w, b)
}

// buildRoute computes the route JSON, or nil when dst is unreachable.
func (s *server) buildRoute(i1, j1, i2, j2 int) []byte {
	t0 := time.Now()
	coords, hours, ok := s.grid.SailRoute(i1, j1, i2, j2)
	if !ok {
		return nil
	}
	b := s.grid.RouteJSON(coords, hours, i1, j1, i2, j2)
	log.Printf("route %d,%d -> %d,%d computed in %s (%d vertices)",
		i1, j1, i2, j2, time.Since(t0).Round(time.Millisecond), len(coords))
	return b
}

// parseLonLat parses "lon,lat".
func parseLonLat(s string) (float64, float64, error) {
	a, b, ok := strings.Cut(s, ",")
	if !ok {
		return 0, 0, fmt.Errorf("want lon,lat")
	}
	lon, err := strconv.ParseFloat(strings.TrimSpace(a), 64)
	if err != nil {
		return 0, 0, fmt.Errorf("bad lon")
	}
	lat, err := strconv.ParseFloat(strings.TrimSpace(b), 64)
	if err != nil {
		return 0, 0, fmt.Errorf("bad lat")
	}
	return lon, lat, nil
}

type calRow struct {
	From, To           string
	ModelDays          float64
	DaysTypical        float64
	DaysLow, DaysHigh  float64
	Source             string
}

func (s *server) calibration() ([]calRow, error) {
	s.calOnce.Do(func() {
		s.calRows, s.calErr = s.computeCalibration()
	})
	return s.calRows, s.calErr
}

func (s *server) computeCalibration() ([]calRow, error) {
	var passages []Passage
	if err := loadJSON(filepath.Join(s.root, "data/passages.json"), &passages); err != nil {
		return nil, err
	}
	// Group by origin so each origin's Dijkstra runs once.
	byFrom := map[string][]Passage{}
	for _, p := range passages {
		byFrom[p.From] = append(byFrom[p.From], p)
	}
	froms := make([]string, 0, len(byFrom))
	for f := range byFrom {
		froms = append(froms, f)
	}
	sort.Strings(froms)

	var rows []calRow
	for _, from := range froms {
		op, ok := s.portByID[from]
		if !ok {
			continue
		}
		ci, cj := s.grid.NearestWater(op.Lon, op.Lat, 12)
		if ci < 0 {
			continue
		}
		hours := s.grid.SailTimes(ci, cj)
		for _, p := range byFrom[from] {
			dp, ok := s.portByID[p.To]
			if !ok {
				continue
			}
			di, dj := s.grid.NearestWater(dp.Lon, dp.Lat, 12)
			if di < 0 {
				continue
			}
			h := hours[s.grid.Idx(di, dj)]
			model := math.MaxFloat64
			if h < math.MaxFloat32 {
				model = float64(h) / 24
			}
			rows = append(rows, calRow{
				From: from, To: p.To, ModelDays: math.Round(model*10) / 10,
				DaysTypical: p.DaysTypical, DaysLow: p.DaysLow, DaysHigh: p.DaysHigh,
				Source: p.Source,
			})
		}
	}
	return rows, nil
}

func (s *server) runCalibration(out *os.File) {
	rows, err := s.calibration()
	if err != nil {
		log.Fatal(err)
	}
	fmt.Fprintf(out, "%-22s %-22s %9s %9s %13s   %s\n", "FROM", "TO", "MODEL", "HISTORY", "RANGE", "VERDICT")
	for _, r := range rows {
		verdict := "OK"
		if r.ModelDays < r.DaysLow*0.85 {
			verdict = "FAST"
		} else if r.ModelDays > r.DaysHigh*1.15 {
			verdict = "SLOW"
		}
		fmt.Fprintf(out, "%-22s %-22s %8.1fd %8.0fd %6.0f–%-6.0f   %s\n",
			r.From, r.To, r.ModelDays, r.DaysTypical, r.DaysLow, r.DaysHigh, verdict)
	}
}

func (s *server) handleCalibration(w http.ResponseWriter, r *http.Request) {
	rows, err := s.calibration()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// The wind and current overlays are pure functions of the model — computed
// once, kept for the life of the process.
var (
	windOnce, curOnce sync.Once
	windBytes, curBytes []byte
)

func (s *server) handleWind(w http.ResponseWriter, r *http.Request) {
	windOnce.Do(func() {
		var err error
		windBytes, err = json.Marshal(map[string]any{
			"type": "FeatureCollection", "features": s.grid.WindFeatures(5),
		})
		if err != nil {
			log.Printf("wind overlay marshal: %v", err)
		}
	})
	if windBytes == nil {
		http.Error(w, "wind overlay unavailable", http.StatusInternalServerError)
		return
	}
	writeJSONBytes(w, windBytes)
}

func (s *server) handleCurrents(w http.ResponseWriter, r *http.Request) {
	curOnce.Do(func() {
		var err error
		curBytes, err = json.Marshal(map[string]any{
			"type": "FeatureCollection", "features": s.grid.CurrentFeatures(),
		})
		if err != nil {
			log.Printf("current overlay marshal: %v", err)
		}
	})
	if curBytes == nil {
		http.Error(w, "current overlay unavailable", http.StatusInternalServerError)
		return
	}
	writeJSONBytes(w, curBytes)
}

// handleFlowMask serves a 1° ocean mask (1 = navigable water) for the
// frontend's smooth flow field: 360×161 cells, lat −80…80, lon −180…179,
// row-major from the south, base64-encoded bytes.
var (
	maskOnce  sync.Once
	maskBytes []byte
)

func (s *server) handleFlowMask(w http.ResponseWriter, r *http.Request) {
	maskOnce.Do(func() { maskBytes = s.buildFlowMask() })
	writeJSONBytes(w, maskBytes)
}

func (s *server) buildFlowMask() []byte {
	const W, H = 360, 161
	raw := make([]byte, W*H)
	for row := 0; row < H; row++ {
		lat := -80.0 + float64(row)
		for col := 0; col < W; col++ {
			lon := -180.0 + float64(col)
			if s.grid.NavigableAt(lon+0.01, lat+0.01) {
				raw[row*W+col] = 1
			}
		}
	}
	b, _ := json.Marshal(map[string]any{
		"w": W, "h": H, "lat0": -80, "lon0": -180, "step": 1,
		"mask": base64.StdEncoding.EncodeToString(raw),
	})
	return b
}

// exportStatic writes the precomputed client artifacts: the packed navigable
// grid plus the JSON for every endpoint that is a pure function of the model
// (meta, wind, currents, flowmask, calibration). The WASM client computes
// isochrones and routes on demand from grid.bin; these files cover the rest.
func (s *server) exportStatic(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	write := func(name string, b []byte) error {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, b, 0o644); err != nil {
			return err
		}
		log.Printf("wrote %s (%d bytes)", path, len(b))
		return nil
	}

	if err := write("grid.bin", s.grid.MarshalBinary()); err != nil {
		return err
	}
	meta, _ := json.Marshal(map[string]any{"thresholds": thresholds, "ports": s.ports})
	if err := write("meta.json", meta); err != nil {
		return err
	}
	wind, _ := json.Marshal(map[string]any{"type": "FeatureCollection", "features": s.grid.WindFeatures(5)})
	if err := write("wind.json", wind); err != nil {
		return err
	}
	cur, _ := json.Marshal(map[string]any{"type": "FeatureCollection", "features": s.grid.CurrentFeatures()})
	if err := write("currents.json", cur); err != nil {
		return err
	}
	if err := write("flowmask.json", s.buildFlowMask()); err != nil {
		return err
	}
	rows, err := s.calibration()
	if err != nil {
		return err
	}
	cal, _ := json.Marshal(rows)
	if err := write("calibration.json", cal); err != nil {
		return err
	}

	// Precompute every named-port isochrone as a static file so port picks
	// are instant on the client (the WASM engine only handles arbitrary sea
	// points and routes). Reuses the on-disk cache when present.
	isoDir := filepath.Join(dir, "iso")
	if err := os.MkdirAll(isoDir, 0o755); err != nil {
		return err
	}
	for _, p := range s.ports {
		b := s.isochrone(p.ID)
		if err := os.WriteFile(filepath.Join(isoDir, p.ID+".json"), b, 0o644); err != nil {
			return err
		}
	}
	log.Printf("wrote %d port isochrones to %s", len(s.ports), isoDir)
	return nil
}

func writeJSON(w http.ResponseWriter, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSONBytes(w, b)
}

func writeJSONBytes(w http.ResponseWriter, b []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	_, _ = w.Write(b)
}

func writeJSONError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(code)
	b, _ := json.Marshal(map[string]string{"error": msg})
	_, _ = w.Write(b)
}
