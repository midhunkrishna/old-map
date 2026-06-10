# Harbor Town Plans, c. 1730 — Sources & Confidence Notes

Eight GeoJSON FeatureCollections (`<id>.json`), each a close-zoom plan (zoom ~13–14, roughly a
1–4 km square) of a famous harbor as it stood about 1730. Every feature carries `properties.kind`
(land, shoal, street, block, fort, battery, wharf, church, building, ship, green, canal, gallows, label).
`year_built` is given where known; the two deliberately included post-1730 features are flagged in
their notes (see Nassau). Coordinates are WGS84 `[lon, lat]`, 5 decimal places. All files are
consistent with the typed points already in `data/port_details.json` (same forts at the same
coordinates, gallows, anchorages, careening places).

Authored offline from training knowledge of the period surveys named below and of the surviving
modern street grids; no network sources were fetched. "Documented" below means the feature appears
on a named period survey or is a securely attested building/work; "plausible infill" means the
feature is invented but defensible (right kind, right place, right scale for the date).

---

## nassau.json — Nassau, New Providence
- **Basis:** Herman Moll's Bahamas chart (1729); accounts of Woodes Rogers' restoration of Fort
  Nassau (1718–29); the surviving downtown grid (Bay, George, Frederick, Charlotte, Parliament,
  East/West Streets) anchored to modern positions.
- **Documented:** Fort Nassau (1697, burned 1703, remounted 1718); the western Bar and shallow
  eastern passage; Hog Island and its careening beach; Christ Church (rebuilt 1724); Bay Street
  as the waterfront; the 1718 hangings (gallows point matches `port_details`).
- **Flagged post-1730:** Fort Montagu (`year_built: 1741`) and Government House (`year_built: 1737`)
  are included with explicit POST-1730 notes so the timeline can drop them; an "East Point battery"
  stands in as the plausible 1730 precursor at Montagu's site.
- **Plausible infill:** block subdivision, King/Duke Street alignments (the grid is real but its
  1730 extent is inferred), the Wheel of Fortune tavern (name from period accounts of Nassau
  punch-houses), exact shoal outlines.

## port-royal.json — Port Royal, Jamaica
- **Basis:** the post-earthquake town (rebuilt after 1692, burned 1703, hurricane 1722); street
  names from the 1680s plats of the old city (Thames, Queen, High, Tower, Cannon, Lime, New
  Streets), kept on the surviving ground; Admiralty descriptions of Chocolata Hole.
- **Documented:** Fort Charles (the one survivor of the old five forts); St Peter's Church (1725–26);
  Chocolata Hole careenage; the drowned city northeast of the point (drawn as a `shoal` with ruins
  note); Gallows Point (Rackham 1720, Vane 1721); Rackham's Cay.
- **Plausible infill:** exact post-1692 shoreline of the point (the spit has shifted; drawn to be
  consistent with `port_details`, which places Fort Charles ~250 m west of its modern position —
  the whole town is harmonised to that datum rather than to the modern survey); block layout;
  Hanover Line battery siting; Mosquito Point drawn as a small detached point to honour the
  `port_details` coordinate, which lies off the modern spit line.
- **This is, with Tortuga, the most inferential of the eight plans.**

## tortuga.json — Basse-Terre & Cayonne, Île de la Tortue
- **Basis:** Exquemelin's description; French colonial memoirs of d'Ogeron's settlement; the
  engraved plans of Le Vasseur's Fort de Rocher (1640s). No town survey exists.
- **Documented:** Fort de Rocher (ruinous by 1730); the Basse-Terre roadstead behind its reef;
  Cayonne; the island's iron-bound north coast (hence everything faces the channel). By 1730 the
  place is a backwater — the plan deliberately shows a decayed hamlet, not Exquemelin's boom town.
- **Plausible infill:** virtually all streets, blocks, chapel, landing and battery — placed against
  the real south-shore coastline and the `port_details` points. **Most speculative file of the set.**

## havana.json — Havana
- **Basis:** the intact old-town grid (Obispo, O'Reilly, Oficios, Mercaderes, San Ignacio, Cuba,
  Empedrado, Obrapía, Lamparilla, Amargura, Teniente Rey, Muralla, Sol, Luz…) anchored to modern
  positions; Antonelli's fortification plans (Morro 1589, La Punta c. 1600, La Fuerza 1577);
  the 1674–1740 land-wall surveys; Moll's harbor inset.
- **Documented:** all forts, the land wall (drawn as a thin band along the real Monserrate–Egido
  line), the four plazas plus Plaza del Cristo, Parroquial Mayor (on the Plaza de Armas — the
  cathedral does not yet exist; its site appears as the swampy Plazuela de la Ciénaga), San
  Francisco, Santa Clara, Espíritu Santo, Santo Cristo del Buen Viaje, the Contaduría quay, the
  new royal shipyard (1720s), the plate-fleet anchorage.
- **Plausible infill:** the two minor water batteries (San Telmo, Contaduría); exact wall band
  geometry between known endpoints; Casablanca-side shoreline detail.

## charleston.json — Charles-Town, South Carolina
- **Basis:** Edward Crisp's plan of 1704 (walled town) and the Roberts & Toms "Ichnography of
  Charles-Town at High Water" (1739); the grid south of Broad survives and is anchored to modern
  positions (East Bay, Broad, Tradd, Elliott, Queen, Church, Meeting, King, Longitude Lane).
- **Documented:** Granville and Craven Bastions and the Half-Moon Battery (walls being dismantled
  through the 1720s — noted as part-ruinous); Fort Johnson (1708) on James Island; St Philip's
  (1723) on Church Street; the White Meeting House; the Huguenot church; Vanderhorst's Creek
  (today's Water Street, drawn as both creek/`canal` and proto-street); the wharves ("bridges" —
  Rhett's is securely attested); White Point gallows (Bonnet, 1718); the Bar and Rebellion Road.
- **Plausible infill:** northern "Boundary lane" and market lane; Quaker meeting position; exact
  wharf positions other than Rhett's; Ashley-side marsh shoreline; Shute's Folly outline.

## cartagena.json — Cartagena de Indias
- **Basis:** the surviving walled-city grid anchored to modern positions; the de Murga wall
  circuit as rebuilt after Pointis' sack (1697) per Juan de Herrera y Sotomayor's surveys; the
  plans engraved for the Vernon expedition.
- **Documented:** the full wall circuit (band polygon with bastion notes, Las Bóvedas curtain);
  San Felipe de Barajas shown correctly as the **small 1657 castle only** — the hill-swallowing
  batteries are post-1762; Getsemaní and its half-moon; the cathedral (1612), Santo Domingo
  (1579), San Pedro Claver/San Ignacio (1654), La Trinidad (1643), Santo Toribio (roofing in
  1730), La Popa (1607); Plaza Mayor / Aduana / Coches; the Inquisition tribunal; Boca Grande
  shown as a natural shoaled breach (the stone escollera is later, noted); Tierra Bomba; the
  galeones anchorage. Boca Chica's forts lie ~12 km south, outside this plan's frame — covered by
  `port_details` instead.
- **Plausible infill:** some street names follow the traditional (18th–19th c.) nomenclature whose
  exact 1730 currency is uncertain; quay battery; Castillo Grande ruins battery; Bocagrande spit
  geometry (well attested as breached, exact line conjectural).

## bridgetown.json — Bridge Town, Barbados
- **Basis:** William Mayo's survey of Barbados (1717–21, published 1722) with its Bridge Town
  inset; the surviving street pattern (Broad, Swan, High, Roebuck, Tudor, Marhill Streets,
  Cheapside, Bay Street, the Careenage) anchored to modern positions.
- **Documented:** the Careenage with its Mole; St Michael's church (1665 fabric); the Cage;
  Charles Fort on Needham's Point (the `port_details` "Needham's Point fort"); St Ann's Fort
  (begun 1704–05); Willoughby's Fort on Pelican Island; James Fort at the Careenage mouth;
  Carlisle Bay roadstead.
- **Plausible infill:** block subdivision; Milk Market lane and Constitution Road alignments;
  victualling office and Globe tavern; Garrison Savannah drawn small (the formal garrison
  develops later in the century); reef patch off the Mole.

## batavia.json — Batavia (old Jakarta)
- **Basis:** the VOC plan tradition (Clemendt de Jonghe c. 1650; the 18th-century "Plattegrond
  van Batavia"), anchored to the three points that survive: the Stadhuis of 1710 (Fatahillah
  Square), the canalised Kali Besar, and the Portuguese Buitenkerk (Gereja Sion, 1695). The
  Kasteel and walls were demolished c. 1809, so they are placed from the plans against the modern
  river line — georeferencing here is partial by nature.
- **Documented:** the four-bastion Kasteel (Parel, Saphier, Robijn, Diamant) at the river mouth;
  the 22-bastion brick enceinte (simplified band); the grachten — Kali Besar, Tijgersgracht,
  Leeuwinnegracht, Kaaimansgracht, Amsterdamsche and Maleische Gracht; Prinsenstraat, Heerenstraat,
  Nieuwpoort- and Utrechtsestraat, Jonkersstraat; the Kruiskerk (1640; its 1736 domed successor is
  noted, not drawn); both Portuguese churches; the Stadhuis; the haven-canal with its boom and
  moles; the mud flats; Indiamen lying far out in the roads (Onrust careening island lies ~10 km
  NW, outside the frame — covered by `port_details`).
- **Plausible infill:** exact positions of the east-west grachten between known endpoints; a few
  lane names ("Buiten Portugeesche straat"); the Chinese hospital point; battery names on the
  sea wall; block subdivision.

---

### Georeferencing summary
| Harbor | Grid anchored to modern streets? | Confidence |
|---|---|---|
| Havana | Yes (intact) | High |
| Cartagena | Yes (intact) | High |
| Charleston | Yes (south of Broad) | High |
| Bridgetown | Yes (Broad/Swan/Roebuck) | High |
| Nassau | Yes (Bay/George etc.) | High |
| Batavia | Partial (Stadhuis, river, Gereja Sion) | Medium |
| Port Royal | No (shifted spit; harmonised to port_details datum) | Medium-Low |
| Tortuga | No (real coastline, invented town) | Low |

### Rendering notes
- `land` polygons are meant to overprint the Natural Earth 10m basemap to give a correct local
  shoreline; draw them in the basemap land colour, under all other kinds.
- Polygon `fort` features for Havana's Murallas, Cartagena's Murallas and Batavia's Stadsmuur are
  thin band polygons (Cartagena/Batavia use a hole ring) so they read as wall traces, not fills.
- Timeline filtering: drop features with `year_built > 1730` (Fort Montagu 1741, Government House
  Nassau 1737, Santo Toribio 1732 is "roofing in 1730" and may be kept as under construction;
  Nieuwe Hollandsche Kerk 1736 is mentioned only in a note, not drawn).
