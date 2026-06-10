package engine

import "math"

// Sailing model for an early-18th-century square-rigged ship (merchantman /
// pirate sloop scale). Speed over ground = base hull speed × wind-belt
// strength × point-of-sail factor + projected surface-current component.
//
// The wind belts are the classical annual-mean circulation that period
// sailing directions were built around (NE/SE trades, doldrums, horse
// latitudes, mid-latitude westerlies, roaring forties); see DATA.md for the
// sources and the calibration table against documented 1690–1740 passages.

// BaseSpeedKn is the calibrated mean speed through water with a fair wind on
// the beam. Period ships logged 4–6 kn under way, but whole-passage averages
// fall to 2–4 kn once calms, foul bottoms and cautious night sailing are
// folded in; 3.7 kn fits the documented 1690–1740 passage table best.
const BaseSpeedKn = 3.7

// WindAt returns the annual-mean wind for a position: the compass direction
// the wind blows FROM (degrees), a strength multiplier, and whether the belt
// has a dominant direction (false for doldrums/variables, where the factor
// is applied isotropically).
func WindAt(lon, lat float64) (from float64, strength float64, directed bool) {
	switch {
	case lat > 66:
		return 270, 0.25, true // polar; effectively closed water
	case lat > 58:
		return 265, 0.80, true // subpolar westerlies, fog and gales
	case lat > 36:
		return 258, 1.02, true // N mid-latitude westerlies (from WSW)
	case lat > 28:
		return 0, 0.62, false // horse latitudes / variables
	case lat > 6:
		if lon > 44 && lon < 100 && lat < 26 {
			return 0, 0.85, false // N Indian Ocean: monsoon reversal, annualized
		}
		return 52, 1.05, true // NE trade winds
	case lat > -5:
		if lon > 42 && lon < 100 {
			return 0, 0.80, false // equatorial Indian Ocean under the monsoon
		}
		return 0, 0.42, false // doldrums (ITCZ)
	case lat > -27:
		return 132, 1.05, true // SE trade winds
	case lat > -36:
		return 0, 0.62, false // S variables
	case lat > -52:
		return 282, 1.25, true // roaring forties (the VOC Brouwer route engine)
	case lat > -62:
		return 275, 1.00, true
	default:
		return 270, 0.25, true // ice latitude
	}
}

// sailFactor maps the angle off the wind (0 = bow dead into the wind,
// 180 = dead run) to a speed multiplier for a square-rigged ship, which
// could not point much closer than ~70° to the wind and made best speed on
// a broad reach.
func sailFactor(angleOff float64) float64 {
	switch {
	case angleOff < 35:
		return 0.10 // unsailable; long tacks
	case angleOff < 55:
		return 0.38 // hard beating
	case angleOff < 75:
		return 0.72 // close-hauled
	case angleOff < 105:
		return 1.00 // beam reach
	case angleOff < 140:
		return 1.12 // broad reach — best point of sail
	default:
		return 1.15 // dead run
	}
}

type current struct {
	latMin, latMax float64
	lonMin, lonMax float64
	dirTo          float64 // direction the water flows TOWARD, degrees
	kn             float64
	name           string
}

// The major named surface currents of the age of sail, as rectangles with a
// mean set (direction) and drift (speed). Values follow modern pilot-chart
// climatology rounded to what a 1730 navigator effectively experienced.
var currents = []current{
	{24, 35, -82, -75, 40, 1.8, "Gulf Stream"},
	{33, 42, -75, -58, 65, 1.0, "Gulf Stream"},
	{42, 52, -55, -15, 78, 0.5, "North Atlantic Drift"},
	{16, 30, -22, -12, 205, 0.6, "Canary Current"},
	{8, 20, -58, -20, 272, 0.6, "North Equatorial Current"},
	{10, 18, -79, -60, 285, 0.7, "Caribbean Current"},
	{20, 24, -87, -80, 30, 1.0, "Yucatán Current"},
	{-16, 1, -37, 8, 285, 0.6, "South Equatorial Current"},
	{-28, -16, -48, -38, 215, 0.5, "Brazil Current"},
	{-32, -15, 5, 15, 330, 0.6, "Benguela Current"},
	{-36, -26, 25, 35, 230, 1.4, "Agulhas Current"},
	{-14, -7, 48, 95, 272, 0.6, "Indian South Equatorial Current"},
	{24, 34, 122, 140, 45, 1.4, "Kuroshio"},
	{35, 45, 145, 180, 82, 0.5, "North Pacific Drift"},
	{35, 45, -180, -140, 95, 0.5, "North Pacific Drift"},
	{23, 35, -128, -115, 155, 0.5, "California Current"},
	{9, 19, -180, -115, 272, 0.5, "North Equatorial Current"},
	{9, 19, 125, 180, 272, 0.5, "North Equatorial Current"},
	{-30, -8, -82, -72, 345, 0.7, "Humboldt Current"},
	{-10, -3, -175, -90, 275, 0.5, "South Equatorial Current"},
}

func angDiff(a, b float64) float64 {
	d := math.Mod(a-b, 360)
	if d < -180 {
		d += 360
	}
	if d > 180 {
		d -= 360
	}
	return math.Abs(d)
}

// SpeedAt returns speed over ground (knots) for a ship at (lon, lat)
// steering the given true bearing. Returns 0 for unnavigable latitudes.
func SpeedAt(lon, lat, bearing float64) float64 {
	if lat > 72 || lat < -68 {
		return 0
	}
	from, strength, directed := WindAt(lon, lat)
	v := BaseSpeedKn * strength
	if directed {
		v *= sailFactor(angDiff(bearing, from))
	} else {
		v *= 0.88 // pick your moment in variable airs
	}
	for _, c := range currents {
		if lat >= c.latMin && lat <= c.latMax && lon >= c.lonMin && lon <= c.lonMax {
			v += c.kn * math.Cos((bearing-c.dirTo)*math.Pi/180)
		}
	}
	if v < 0.35 {
		v = 0.35 // kedging, sweeps, patience
	}
	return v
}
