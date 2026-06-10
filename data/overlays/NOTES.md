# Overlay Datasets — Sources & Reasoning

Authored for Carta Temporum, covering nine decades 1650–1730 (inclusive decade keys
1650, 1660 … 1730). All coordinates [lon, lat] WGS84. Authored from historical
training knowledge (no network access in this environment); every dataset cites the
scholarly works it leans on. Geometry is deliberately coarse (≤ ~60 vertices/ring),
with care concentrated on coastlines the app's 67 ports actually touch; interior
continental borders are schematic and should be styled as soft washes, not hard lines.

---

## 1. kingdoms.json (78 features)

**Model.** One stable `empire` key per power (e.g. "England" throughout, with
"Great Britain & Ireland" appearing only in the `label` after the 1707 Union), one
consistent muted hex per empire, and change over time expressed by multiple features
with `from`/`to` decade windows. A decade window means "this shape is a fair picture
of the claim during that decade"; mid-decade events (Jamaica 1655, New York 1664,
Gibraltar 1704) are assigned to the decade in which the new ownership dominates, with
the precise year in the `note`.

**Colors.** Spain ochre-red `#a8603c`, England rose-madder `#a85a6e`, France faded
blue `#6e85a8`, Portugal moss green `#6f8a5a`, Netherlands burnt orange `#b07a3c`,
Ottoman olive `#8a8a4f` (Barbary Regencies a sibling `#94905a`), Morocco sand
`#c2a878`, Mughal dusty violet `#8a6e8f`, Persia dusty gold `#a08a52`, Qing pale sage
`#92a487`, Zheng/Tungning `#a39b6b`, Japan clay `#9c7d6a`, Russia drab `#8c8772`,
Denmark slate `#7a828c`, Sweden blue-slate `#6f7a88`.

**Key transitions encoded.**
- Jamaica: Spain `to:1650` → England `from:1660` (taken 1655, Western Design).
- Hispaniola: whole-island Spanish 1650 only; thereafter split into Spanish Santo
  Domingo (east) and a French west — "Tortuga & the Coast of Saint-Domingue"
  1660–1690 (buccaneer, de facto), relabeled "Saint-Domingue" from 1700 (Ryswick 1697).
- New Netherland (Dutch) `to:1660` → "New York & the Jerseys" `from:1670`; the 1664
  capture and the 1673–74 Dutch interlude are noted, not separately shaped.
- Acadia (France) `to:1700` → Nova Scotia (Britain) `from:1710` (Port Royal 1710,
  Utrecht 1713); Île Royale/Louisbourg stays French `from:1710`.
- Hudson Bay `from:1670` (HBC charter), note records the contested 1686–1713 phase.
- Gibraltar `from:1700` (taken 1704, confirmed 1713).
- Bombay `from:1660` (1661 dowry / 1668 EIC lease); Pondicherry `from:1680`
  (founded 1674, Dutch 1693–99); Dutch Ceylon and Cochin `from:1660` (1656–58, 1663).
- Colônia do Sacramento `from:1680`.
- Taiwan: Dutch Formosa 1650 only → Kingdom of Tungning 1660–1670 → Qing `from:1680`
  (Shi Lang, 1683).
- Mughal Empire in three windows: 1650–1680 (pre-Deccan), 1690–1700 (Aurangzeb's
  peak after Bijapur 1686/Golconda 1687), 1710–1730 (post-1707 decline).
- Ottoman Empire in two windows split at Karlowitz 1699 (Hungary and Podolia lost);
  Barbary Regencies carried as a separate olive-family feature throughout.
- Safavid Persia `to:1710`, with a "Persia (in turmoil)" feature 1720–1730 (Afghan
  capture of Isfahan, 1722).
- Sweden loses its Baltic-province polygon after 1710 (Nystad 1721).

**Sources.** J.H. Parry, *The Spanish Seaborne Empire*; C.R. Boxer, *The Dutch
Seaborne Empire* and *The Portuguese Seaborne Empire* (also *The Golden Age of
Brazil*); N.A.M. Rodger, *The Command of the Ocean* (British stations and
acquisitions); standard reference atlases of colonial America and the Ottoman,
Mughal, Safavid and Qing empires. Treaty dates: Westminster 1674, Breda 1667,
Madrid 1670, Ryswick 1697, Karlowitz 1699, Utrecht 1713, Passarowitz 1718, Nystad 1721.

**Caveats.** Interior boundaries (Louisiana, Rupert's Land, Siberia, the Mughal and
Ottoman inland edges) are schematic by design. "Control" in Asia means coastal
enclaves: Dutch Ceylon is drawn as the whole island lowland with a note that Kandy
held the interior; the Philippine south, Java's interior, and the Mosquito Coast were
never effectively governed by the colors shown.

---

## 2. fleets.json (113 station entries, 11–14 per decade)

**Model.** Each entry is a standing deployment in the given decade with an honest
approximate strength in rated warships/galleys and an anchor point at the usual base
or cruising centre. Strengths are decade-typical, not mobilization peaks; flagship
names are given only where strongly associated with the station and decade
(Brederode, De Zeven Provinciën, Royal Charles, Soleil Royal, Britannia, Association,
Breda, Swallow…).

**Reasoning per power.**
- *Royal Navy*: Channel/Grand fleet always; Mediterranean squadron episodic under
  Blake and the Tangier years, permanent after 1704 (Gibraltar, Port Mahon 1708);
  Jamaica Station regular from the 1690s, Leeward Islands, North America and the
  Newfoundland convoy as Rodger describes; Baltic fleets under Norris 1715–21;
  one-off entries for famous operations (Western Design 1655, Rogers' Bahamas 1718,
  Ogle's Swallow 1722, Hosier's Portobelo blockade 1726–27).
- *France*: Colbert's rise (Brest/Toulon), Tourville's 70 at Brest in the 1690s,
  the post-1694 pivot to guerre de course (Dunkirk/Saint-Malo entry), Antilles and
  Saint-Domingue squadrons (d'Estrées, Ducasse, Pointis), post-1713 collapse and
  Maurepas' 1730s revival.
- *Spain*: flota and galeones escorts, Armada de Barlovento (re-established 1665),
  Armada del Mar del Sur at Callao, Patiño's revival and Cape Passaro 1718,
  guarda-costas in the 1720s–30s.
- *Dutch*: great home fleets through 1674, the 5:3 Allied quota in the 1690s–1700s,
  then a convoy-escort navy; VOC return-fleet escorts at the Cape throughout.
- *Portugal*: Brazil Company convoys from 1649, gold-fleet escorts after 1695.
- *Ottoman/Barbary*: Cretan War fleets, Aegean fleet of the Morean War, and the
  Algiers corsair squadron carried in every decade at declining strength.

**Sources.** N.A.M. Rodger, *The Command of the Ocean* (chs. on the Anglo-Dutch
wars, the two French wars, and station lists); Jan Glete, *Navies and Nations*
(comparative fleet sizes — the backbone of every `ships` figure); Parry and Boxer
for Iberian and Dutch escort practice. Ship counts should be displayed as "about N
sail" — they are decade-scale approximations, deliberately conservative.

---

## 3. danger.json (60 zones, 5–8 per decade)

**Model.** Sea-area polygons (5–15 vertices) with intensity 1–3. The same named
ground recurs across decades with changing intensity, so the app can animate the
ebb and flow.

**Narrative arc encoded** (after Rediker, *Villains of All Nations*; Cordingly,
*Under the Black Flag*; Earle, *The Pirate Wars*):
- **1650s–70s** — buccaneers: Tortuga → Port Royal; Myngs, then Morgan (Portobelo
  1668, Maracaibo 1669, Panama 1671); logwood coasts; Anglo-Dutch war privateering
  in the narrow seas.
- **1680s** — the South Sea raids (Sharp, Davis, Dampier) shift danger to the
  Pacific coast; Veracruz 1683 and Campeche 1685 are the Caribbean swan-song; first
  Roundsmen reach the Red Sea.
- **1690s** — the Pirate Round at its height (St Mary's, Every's Ganj-i-Sawai 1695,
  Tew) while French guerre de course makes the Western Approaches the most dangerous
  water in the world.
- **1700s** — piracy nearly vanishes into lawful privateering (War of the Spanish
  Succession); zones mark privateer seas, not pirate seas.
- **1713–26** — the post-war explosion: Nassau, the 1715 plate-fleet wrecks, the
  North American seaboard (Blackbeard, Bellamy), then Africa and the Indian Ocean
  revival (Roberts; Taylor & Levasseur, Cassandra 1720, Nossa Senhora do Cabo 1721).
- **Late 1720s–30** — collapse under mass hangings and naval patrols; what remains
  is guarda-costa licensed predation and the perennial Barbary corso, which is
  carried at intensity 2–3 in every decade (raid range to Ireland/Iceland noted as
  a pre-1650 phenomenon already tapering).

**Caveats.** Intensities are editorial judgments on a 3-step scale, not statistics;
the Barbary zone especially is a steady institution whose decade-to-decade variation
is smoothed. Polygons are cruising grounds, not exclusion zones — prizes were taken
outside them.

---

## 4. Other overlay ideas worth building

- **Treasure-fleet schedule & tracks** — flota/galeones seasonal routes with sail
  dates; highly feasible, well documented (Parry; Walton); pairs beautifully with
  danger.json.
- **Hurricane season bands** — June–November risk shading for the Caribbean and a
  typhoon band for the China Sea; trivially feasible from climatology and period
  sailing directions.
- **Trade-good flows** — sugar, tobacco, silver, slaves, spices, cod as flow arrows
  per decade; feasible at coarse resolution from Boxer/Parry and Atlantic-trade
  scholarship.
- **Slave-trade volume** — decade-by-decade embarkation/disembarkation intensity on
  the African and American coasts; very feasible — the SlaveVoyages (TASTD) database
  gives hard numbers per decade and region.
- **Fishing & whaling grounds** — Grand Banks cod, Spitsbergen/Davis Strait whaling
  (Dutch peak c. 1680); feasible from well-mapped historical grounds.
- **Pearl fisheries** — Margarita/Rio de la Hacha, the Persian Gulf banks, Ceylon's
  Gulf of Mannar; small, point-like, easy, and very "antique chart".
- **Smuggling & interloper routes** — Curaçao/Statia/Sacramento contraband arteries
  into the Spanish empire; feasible as stylized arrows, sources qualitative.
- **Monsoon & sailing-season calendar** — when one could sail Surat→Mocha or
  Canton→Batavia; feasible from period sailing directions; complements wind/current
  layers you already plan.
- **Pilgrim & Manila routes** — the Mocha fleet and the Manila galleon as single
  storied tracks with seasonal windows; trivial to author, high narrative value.
- **Mortality/disease zones** — yellow-fever ports and the "white man's grave"
  Guinea coast; feasible as port-level badges; sources: Rodger on fleet mortality
  (e.g. Hosier 1726).

---

*Validation: all three JSON files pass `python3 -m json.tool`; all polygon rings are
closed, ≤ 60 vertices; decade keys are exactly {1650…1730}.*
