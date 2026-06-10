# Pirate Timeline Dataset — Research Notes

Companion to `pirates.json`. Authored from standard secondary scholarship and the named
primary sources below (no network access at authoring time). All positions are honest
approximations of documented cruises, placed **at sea or at known anchorages**, never inland.
Where a raid target was an inland town (Panama, León, San Pedro, Gibraltar-on-the-Lake), the
track point is the fleet's documented anchorage or landing, with the march noted in the text.

## Conventions and deliberate simplifications

- **Coordinates** are WGS84 decimal degrees, deliberately coarse (0.01–0.1°). Open-sea cruise
  points are representative of a cruising ground, not a fix. Points flagged
  "position conjectural/approximate" in their note are exactly that.
- **Seasons** map to calendar months on the northern convention everywhere
  (Dec–Feb = winter, Mar–May = spring, Jun–Aug = summer, Sep–Nov = autumn), *including
  southern-hemisphere positions*, so the UI's interpolation stays monotonic. A January event
  at Mauritius is therefore "winter".
- **crew_size** is a peak approximation. For fleet commanders (Myngs, Morgan, Grammont) it is
  the expedition's manpower, not one ship's company — see per-pirate notes.
- **notable_crew** contains only documented people (trial records, depositions, Exquemelin,
  Ringrose, Johnson). No invented names. The generic Salé entry names no individuals at all.
- **Flags**: `documented` = period source (trial testimony, newspapers, Ringrose, Johnson);
  `traditional` = the familiar design rests on 18th–20th-century attribution, not period
  evidence; `unknown` = nothing reliable. Note that most "famous" Jolly Rogers (Blackbeard's
  horned skeleton, Rackham's crossed cutlasses, Tew's arm-and-cutlass, Every's profile skull,
  Bonnet's heart-and-dagger, Condent's triple skull) are *traditional*, popularized long after
  the fact; period sources usually say only "black colours" or "death's head".
- **Johnson caveat**: Charles Johnson's *General History of the Pyrates* (1724) is the richest
  single source for the golden age but mixes archival fact with invention (the Misson/Libertalia
  chapters are fiction; speeches and some flags are embroidered). Where an entry rests on
  Johnson alone, treat dates and dialogue as colour, not record.
- **Track density**: 3–8 points per year only where itineraries are genuinely documented
  (Roberts, Thatch, Kidd). Obscure years get one point or none. Gaps are real gaps.
- Cross-references to the app's own data: wreck ids `whydah`, `queen-annes-revenge`,
  `adventure-galley`, `quedagh-merchant`, `speaker`, `fiery-dragon`, `royal-james`,
  `golden-fleece`; port ids `nassau`, `port-royal`, `tortuga`, `petit-goave`,
  `ile-sainte-marie`, `bath-ocracoke`, `saint-denis`, `sale`, `charleston`, `cape-coast`,
  `ouidah`, `st-johns` all line up with this file's events.

## Per-pirate confidence

| id | confidence | notes |
|---|---|---|
| christopher-myngs | HIGH (events) / MEDIUM (positions) | Naval officer with buccaneer auxiliaries; Cumaná–Coro 1659, Santiago 1662, Campeche 1663 well documented (Earle). Crew 1,400 = 1663 expedition manpower. Mansfield/Whetstone's presence documented in expedition accounts. |
| francois-lolonnais | MEDIUM | Rests almost wholly on Exquemelin, who is vivid but partisan; the 260,000-peso Maracaibo figure and the cannibal death are his. Final wreck site (Mosquito Coast cays → Darién) is approximate by nature. |
| henry-morgan | HIGH | Among the best-documented careers of the era (Exquemelin, Modyford's papers). Flagged era `buccaneer` per spec but he operated under Jamaica privateering commissions — noted in flag/fate. Panama itself is inland; track keeps to the Chagres anchorage. |
| michel-de-grammont | MEDIUM | Veracruz/Campeche/La Guaira documented; his 1686 loss is certain in fact, wholly conjectural in position (placed north of the Bahama Channel). crew 1,300 = combined Veracruz force, co-commanded. |
| laurens-de-graaf | HIGH (events) / MEDIUM (dates) | Princesa payroll prize, Veracruz, the 1685 Yucatán Channel fight, and his later French service are well attested. Ship succession simplified to "Neptune" with predecessors in ship_type. |
| bartholomew-sharp | HIGH | Ringrose's published journal gives near-daily positions — the best-tracked cruise in the file. The red-white-green company flag is genuinely documented (rare for this era). The "tin" that was silver and the derrotero acquittal are from Ringrose and the trial. |
| edward-davis | MEDIUM-HIGH | Wafer and Dampier are first-hand. His exact role at Guayaquil 1687 is hedged ("cruises off"); "Davis Land" is a documented *claim* of a sighting, not a place. |
| jan-willems-yankey | LOW-MEDIUM | Thinnest buccaneer entry: ship name unrecorded, death uncertain — kept sparse (5 points) and hedged accordingly. |
| sale-rovers | MEDIUM (as a phenomenon) | Deliberately generic squadron entry per spec — no invented captains. Track points are labelled "representative cruise" on standard corsair grounds; only the 1714+ context and the 1721 treaty are event-specific. Era `privateer` (licensed corsairs). |
| thomas-tew | MEDIUM | Johnson plus Rhode Island/New York records. The 1693 prize value (£100k) and his death-wound description are Johnson. Flag is 19th-c. tradition. |
| henry-every | HIGH | Mutiny, flotilla, Ganj-i-Sawai, Nassau bribe and Irish landing all supported by the 1696 trial record and EIC correspondence. Prize value range £325k–600k spans contemporary estimates. Crewmen named are from the trial. |
| william-kidd | HIGH | Trial record, Bellomont papers, and Zacks' archival reconstruction; itinerary is among the most certain in the file. Both his wreck (`adventure-galley`) and his prize (`quedagh-merchant`) are on the map. |
| robert-culliford | MEDIUM | 1697–99 (Mocha/Resolution, Great Mohammed, pardon) solid; 1690–96 is patchy (noted in the single 1690 point). |
| dirk-chivers | LOW-MEDIUM | Included per spec option. Calicut ransom episode and Great Mohammed are documented (Rogoziński); the 1695 Every-flotilla link is "reputedly". Only 4 points. |
| john-bowen | MEDIUM | Johnson vol. II plus the excavated Speaker wreck (1702, Grand Port — on the map). Speedy Return seizure place/date simplified; coast position approximate. Covers the 1700s decade. |
| benjamin-hornigold | MEDIUM-HIGH | Woodard's archival work covers 1713–18 well; his 1719 wreck is Johnson-only and the position is flagged conjectural. |
| samuel-bellamy | HIGH | 1717 Boston trial testimony plus the excavated Whydah (wreck id `whydah`); cargo list matches the archaeology. |
| edward-thatch | HIGH | Best-documented golden-age career (trial depositions, Virginia council records, QAR archaeology). The famous flag is **traditional**, deliberately downgraded from the popular image. |
| stede-bonnet | HIGH | His own trial record (1719). Battle site matches wreck id `royal-james`. |
| charles-vane | MEDIUM-HIGH | Nassau fireship and deposition-by-vote well attested; his 1719 wreck cay is approximate (Bay Islands offing). active_to 1719 = last cruise; hanged 1721 (in fate). |
| jack-rackham | HIGH | *The Tryals of Captain John Rackam and other Pirates* (Jamaica, 1721) names Bonny, Read, Fetherston, Corner; the William theft and Negril capture are from it. Crossed-cutlass flag: traditional. |
| howell-davis | MEDIUM-HIGH | Johnson, corroborated by RAC records for Gambia; the Buck mutiny quote is Johnson colour. |
| bartholomew-roberts | HIGH | Johnson here is corroborated by the 1722 Cape Coast trial record and RAC/Admiralty papers. Both flags are documented (eyewitness). Sagrada Família, Trepassey, Onslow, Ouidah, Cape Lopez all firm. Largest track (14 points). |
| edward-england | MEDIUM-HIGH | The Cassandra fight is documented by Captain Macrae's own published letter. E.T. Fox's argument that "Jasper Seagar" was the squadron's actual commander (England's role possibly inflated by Johnson) is noted but the conventional identification is kept. |
| john-taylor | MEDIUM-HIGH | Cabo capture (April 1721, Bourbon roadstead) is firm; total value estimates vary widely (£500k–£875k+); "42 diamonds a man" is the traditional division figure from Johnson-derived accounts. Portobelo surrender is the standard account, lightly documented. |
| olivier-levasseur | MEDIUM | Early Caribbean and 1719 Sierra Leone phases documented; 1722–29 Madagascar years are thin (one hedged point). Execution at Saint-Paul, 7 July 1730, is from Bourbon colonial records. The cryptogram/Fiery Cross treasure is **legend** and labelled so. |
| christopher-condent | MEDIUM | Johnson plus the Fiery Dragon excavation (wreck id `fiery-dragon` — burned at Sainte-Marie 1721 under his successor). The triple-skull flag is traditional. Brazil-coast phase is thin. |
| george-lowther | MEDIUM-HIGH | Johnson, Massey's court-martial, and the Eagle's report of Blanquilla. The mid-ocean point where Low split off is approximate by nature. |
| edward-low | MEDIUM-HIGH | Port Roseway, the Greyhound action and the Newport hangings are firmly documented (1723 trial, Boston News-Letter — which also describes the red-skeleton flag). His end is genuinely unknown; final 1724 point flagged conjectural. |

## Coverage check (entries active in each decade)

1650s: 2 · 1660s: 4 · 1670s: 5 · 1680s: 6 · 1690s: 7 · 1700s: 2 · 1710s: 12 · 1720s: 9 · 1730: 1 (La Buse, hanged July 1730).
The quiet 1700s–early 1710s are historically real (the War of the Spanish Succession absorbed
seamen into privateering); Bowen and the Salé entry carry the timeline through honestly.

## Sources

- Alexandre Exquemelin, *The Buccaneers of America* (1678; later French/English editions) — buccaneer era; partisan, used with care.
- Basil Ringrose, journal in *Bucaniers of America, vol. II* (1685); William Dampier, *A New Voyage Round the World* (1697); Lionel Wafer, *A New Voyage and Description of the Isthmus of America* (1699) — South Sea cruises, first-hand.
- Charles Johnson, *A General History of the Pyrates* (1724, vol. II 1728) — golden age backbone, with the reliability caveats above.
- Trial records: *Tryals of Joseph Dawson et al.* (Every's crew, 1696); Kidd's trial (1701); *Tryals of Major Stede Bonnet* (1719); *The Tryals of Captain John Rackam and other Pirates* (1721); the Cape Coast Castle trials (1722); the Newport trials (1723).
- Marcus Rediker, *Villains of All Nations* (2004); David Cordingly, *Under the Black Flag* (1995); Colin Woodard, *The Republic of Pirates* (2007); Peter Earle, *The Pirate Wars* (2003); Jan Rogoziński, *Pirates!* (1995); E.T. Fox (pirate flags and Indian Ocean revisions); Angus Konstam, *Blackbeard* (2006); Richard Zacks, *The Pirate Hunter* (2002); Barry Clifford (Whydah excavation); John de Bry (Fiery Dragon excavation).
