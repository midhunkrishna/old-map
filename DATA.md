# The model and its sources

## What the isochrones are

Each isochrone band answers: *from the chosen port, how far could a well-found,
well-handled square-rigged ship of c. 1730 expect to sail in N days, taking the routes a
good sailing master would actually take?*

The sea is a 0.15° grid (~9 nautical miles at the equator). The cost of moving between
neighboring cells (16 compass directions, so the router can shape courses to the wind)
is `distance / speed-over-ground`, and the full time field is the shortest path from the
origin port (Dijkstra). Isochrone polygons are extracted with marching squares and
smoothed. Because the router minimizes *time*, not distance, it reproduces the period's
sailing directions on its own: south to the trades before turning west, home via the
Gulf Stream and the westerlies, the VOC's dive into the roaring forties, the Manila
galleon's great northern arc back to Acapulco.

## Speed over ground

`speed = 3.7 kn × belt-strength × point-of-sail factor + current component`

**Wind belts** (annual means of the trade-wind circulation, as described in period
sailing directions and modern pilot-chart climatology):

| Latitude | Belt | From | Strength |
|---|---|---|---|
| > 58°N | subpolar westerlies | W | 0.80 |
| 36–58°N | westerlies | WSW | 1.02 |
| 28–36°N | horse latitudes | variable | 0.62 |
| 6–28°N | NE trades | NE | 1.05 |
| 5°S–6°N | doldrums (ITCZ) | calm | 0.42 |
| 5–27°S | SE trades | SE | 1.05 |
| 27–36°S | variables | variable | 0.62 |
| 36–52°S | roaring forties | W | 1.25 |

The north Indian Ocean (monsoon reversal) is treated as moderately favorable in the
annual mean. Latitudes beyond 72°N / 68°S are closed (ice).

**Point of sail** (square rig): dead into the wind 0.10 (long tacks), hard beating 0.38,
close-hauled 0.72, beam reach 1.00, broad reach 1.12, run 1.15. A square-rigger could not
point closer than ~70° to the wind — this asymmetry, not distance, is why the model (like
the record) makes Boston→London twice as fast as London→Boston.

**Currents**: 20 named surface currents as rectangles with mean set and drift (Gulf
Stream 1.8 kn in the Florida Strait, Agulhas 1.4 kn, Kuroshio 1.4 kn, the equatorial
currents ~0.5–0.7 kn, etc.), projected onto the ship's course. Values follow modern
pilot-chart climatology (cf. Bowditch, *The American Practical Navigator*).

The 3.7 kn base is a *passage average* for a clean, single ship — period logs show 4–6 kn
under way, but whole-passage means of 2–4 kn once calms and caution are included
(cf. CLIWOC logbook statistics, ~4 kn under way, 1750–1850).

## Calibration against the record

Run `go run ./cmd/server -calibrate`. Current results against 22 documented passages
(also shown in the app under "Concerning this chart"):

| Passage | Model | Recorded typical | Recorded range |
|---|---|---|---|
| London → Barbados | 57 d | 49 d | 40–70 |
| London → Boston | 72 d | 52 d | 42–78 |
| Boston → London | 29 d | 33 d | 25–45 |
| London → Jamaica | 64 d | 63 d | 49–91 |
| Jamaica → London | 50 d | 62 d | 49–85 |
| Cádiz → Veracruz | 54 d | 75 d | 60–95 |
| Havana → Cádiz | 41 d | 65 d | 50–85 † |
| Cádiz → Cartagena | 44 d | 56 d | 45–70 |
| Lisbon → Bahia | 53 d | 63 d | 50–80 |
| Bristol → Gold Coast | 60 d | 50 d | 38–70 |
| Ouidah → Barbados (Middle Passage) | 50 d | 65 d | 50–90 |
| Texel → Cape Town | 122 d | 115 d | 90–150 |
| Cape Town → Batavia | 57 d | 58 d | 42–80 |
| Texel → Batavia | 172 d | 238 d* | 180–300 |
| London → Bombay | 176 d | 175 d | 140–230 |
| Acapulco → Manila | 70 d | 95 d | 75–120 |
| Manila → Acapulco | 100 d | 180 d | 150–240 † |
| Newport → Île Sainte-Marie | 139 d | 110 d | 90–150 |

\* recorded VOC total includes a ~3-week refreshment stop at the Cape, which the model
does not take.
† the two flagged-fast passages are convoy/galleon records: the Carrera fleets and the
Manila galleon were grossly overloaded, sailed on administrative timetables rather than
the best season, and (for the eastbound galleon) spent weeks clawing out of the
Embocadero. The model is an optimal-routing lower bound there; treat its Pacific
eastbound times as "a clean private ship", not "the galleon".

### Passage sources

- Ian K. Steele, *The English Atlantic 1675–1740* (Atlantic passage statistics)
- J.R. Bruijn, F.S. Gaastra, I. Schöffer, *Dutch-Asiatic Shipping* (VOC voyage durations)
- Pierre & Huguette Chaunu, *Séville et l'Atlantique*; A. García-Baquero (Carrera de Indias)
- W.L. Schurz, *The Manila Galleon*
- C.R. Boxer, *The Golden Age of Brazil*
- K.N. Chaudhuri, *The Trading World of Asia and the English East India Company*
- slavevoyages.org (Trans-Atlantic Slave Trade Database; Middle Passage durations)

## Ports, routes, wrecks

- **Ports** (67): positions are the historical anchorages (e.g., Texel roadstead for
  Amsterdam, Ocracoke Inlet for Bath). Status, nation and roles are as of c. 1730 —
  e.g., Nassau *after* Woodes Rogers, Port Louis still a hamlet, the Casa de
  Contratación already moved to Cádiz (1717). Population figures are period estimates
  (~) from colonial censuses and standard urban histories; defences, trade and the
  annals entries follow the same scholarship as the passage table.
- **Routes** (18): waypoints hand-shaped to the documented tracks (rutters and the
  scholarship above), e.g. the flota entering at Dominica and passing south of
  Hispaniola, the galleon's eastbound arc at ~38°N.
- **Wrecks** (32): all real, 1622–1735, positions from the archaeological record where
  found (QAR Project, Florida Division of Historical Resources, Western Australian
  Museum, Mel Fisher Maritime Museum, UNESCO). Positions flagged `exact`,
  `approximate`, or `general-area` (the San José's coordinates are a Colombian state
  secret). Famous corrections honored: Roberts' *Royal Fortune* was **captured**, not
  wrecked, at Cape Lopez (so it isn't here), and Clifford's 2015 "Kidd silver ingot" at
  Île Sainte-Marie was debunked by UNESCO (lead ballast).

## The timeline and overlay datasets

- **Kingdoms & Empires** (`data/overlays/kingdoms.json`): 78 territorial features for 16
  powers, each valid for a window of decades 1650–1730, so the wash repaints as the
  timeline moves — Jamaica turns English in the 1650s, Saint-Domingue French at Ryswick,
  Gibraltar British in the 1700s, Acadia and Hudson Bay British at Utrecht, Formosa Qing
  in the 1680s, the Mughal wash swelling to ~1700 and shrinking after. Interior borders
  are deliberately schematic (this is a sea chart); sources include Parry, Boxer, and the
  standard imperial histories (see `data/overlays/NOTES.md`).
- **Men-of-War** (`fleets.json`): 113 standing naval stations by decade — Jamaica
  Station, the Armada de Barlovento, flota escorts, VOC return-fleet escorts, Barbary
  corsair squadrons — with approximate strengths after Rodger (*The Command of the
  Ocean*) and Glete (*Navies and Nations*).
- **Pirate Waters** (`danger.json`): 60 sea-area danger zones by decade tracing the arc
  from the buccaneers through the Pirate Round, the privateering war, the 1713–1726
  explosion, and the collapse.
- **Pirates** (`data/timeline/pirates.json`): 29 captains/squadrons, 216 seasonal track
  points, 1650 (Myngs, the Salé Rovers) to 1730 (La Buse hanged at Réunion). Positions
  are documented cruising grounds, not fixes; crews are named only from trial records and
  the standard scholarship (Johnson 1724 with its caveats, Rediker, Cordingly, Woodard,
  Exquemelin for the buccaneers); flags are graded documented / traditional / unknown.
  Confidence notes per pirate in `data/timeline/NOTES.md`.
- **Harbor plans** (`data/harbors/`): eight street-level town plans c. 1730. Havana,
  Cartagena, Charleston, Bridgetown and Nassau are anchored to their surviving colonial
  street grids; Port Royal is harmonised to the post-1692 town on the Palisadoes spit;
  Batavia to the remnants of the VOC old town; Tortuga is a documented-fort,
  plausible-town reconstruction (no survey exists). Post-1730 works (Fort Montagu 1741,
  Government House 1737) carry `year_built` and stay hidden at 1730. Survey bases per
  harbor in `data/harbors/NOTES.md`.
- **Wreck enrichment** (`data/wrecks_enrichment.json`): depth, treasure values (period
  and modern where published), salvage history, condition, souls, and a documented cargo
  manifest for all 32 wrecks; presentation design notes in
  `data/research/wreck_presentation.md`.
- **Illustrations** (`data/images.json`): 44 public-domain images — the Johnson *General
  History* engravings, Ferris and Pyle paintings, period port views — every Commons
  filename verified against the Commons API at authoring time.
- **Events** (`data/events.json`): 38 dated events 1650–1730 (15 battles, 8 storms,
  8 sacks, 6 trials, 1 earthquake), positions at the documented sites, wreck-site events
  reusing the wreck coordinates exactly. Confidence per event in
  `data/research/events_notes.md` — e.g. the Salé Rovers entry is a representative-year
  anchor, and open-sea action positions (Ganj-i-Sawai) are honest approximations.
- **Voyage routes** (`/api/route`): the same Dijkstra field as the isochrones, with
  parent-pointer path extraction — so a plotted voyage is *exactly* the route the
  isochrone model believes fastest, including its asymmetries (London→Boston ~70 days,
  Boston→London ~27 in the model).

## Known limitations

- Annual means only: no seasons, no monsoon timing, no hurricane months — the very
  things that wrecked half the ships on this chart.
- Near the origin port the bands show the 0.15° grid's 16-direction anisotropy (slightly
  angular contours at harbor zoom).
- Coastal cells are biased toward "water" so historic straits stay open at grid
  resolution; a handful of straits (Gibraltar, Dover, Sunda, Malacca, Øresund,
  Bab-el-Mandeb, Hormuz) are explicitly kept navigable.
- The model sails everywhere ice allows, including routes (Cape Horn) rarely attempted
  in 1730.
