# Carta Temporum — Events Research Notes

Authored 2026-06-09 from training knowledge (network research unavailable in this session).
Primary scholarship relied on: Exquemelin (*The Buccaneers of America*, 1678, incl. Ringrose's South Sea journal), Peter Earle (*The Sack of Panamá*; *The Pirate Wars*), David Cordingly (*Under the Black Flag*), Colin Woodard (*The Republic of Pirates*), Marcus Rediker (*Villains of All Nations*), N.A.M. Rodger (*The Command of the Ocean*), Robert Marx (*Shipwrecks of the Americas*), Captain Charles Johnson (*A General History of the Pyrates*, 1724), and printed Admiralty trial records (Rackham 1721, Bonnet 1719, Cape Coast 1723, Newport 1723, Boston 1717, Kidd 1701).

## Conventions
- **Coordinates**: WGS84, `[lon,lat]` in tours, `lat`/`lon` fields in events. Where a wreck id exists in `data/wrecks.json`, the event reuses that wreck's coordinates exactly. Sea-battle and offshore positions are necessarily approximate (flagged below).
- **Seasons**: assigned by calendar month, Northern-Hemisphere naming (Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov autumn), applied uniformly even for Southern-Hemisphere events (Mauritius, Réunion, Australia). `null` where only the year is documented.
- **Old Style / New Style**: English events of this period are recorded O.S.; dates are given as conventionally cited in the scholarship (e.g., Ocracoke 22 Nov 1718 O.S.; Great Storm 26–27 Nov 1703 O.S.; San José 8 Jun 1708 N.S.). No conversion applied.
- **Confidence**: HIGH = documented day/month and place; MEDIUM = documented event, approximate date or position; LOW = representative/synthesized entry, honestly flagged.

## Per-event notes

| id | date confidence | notes |
|---|---|---|
| sale-rovers-height-1651 | LOW (year representative) | The Salé corsair "republic" peaked c. 1620s–1660s; 1651 is a representative year chosen to anchor the 1650s, not a dated event. Position: Salé/Bou Regreg bar. Sources: Coindreau; Earle. |
| wreck-vergulde-draeck-1656 | HIGH | 28 Apr 1656; reef strike (navigational loss, not strictly a storm — `storm` is the closest available type). 75 survivors ashore documented in VOC records; rescue missions failed. Position = wrecks.json `vergulde-draeck`. |
| myngs-sacks-santiago-1662 | HIGH (month) | Oct 1662. Henry Morgan's presence on this raid is traditional but not certain, so he is not linked. Position: Santiago de Cuba. |
| lolonnais-sacks-maracaibo-1666 | MEDIUM (year) | Exquemelin's chronology is loose; sources give 1666 or 1667. Season null. Position: Maracaibo city (not in ports.json; tortuga linked as the expedition's base). |
| morgan-takes-portobelo-1668 | HIGH | Jul 1668; ransom of 100,000 pesos per Earle. |
| morgan-maracaibo-fireship-1669 | HIGH (within weeks) | Fireship action at the bar, late Apr 1669. Position: lake mouth near San Carlos bar, approximate. |
| morgan-burns-panama-1671 | HIGH | Battle of Mata Asnillos and burning, 28 Jan 1671 — single entry as specified. Cause of fire disputed (Spanish garrison vs buccaneers); note reflects this honestly. Position: Panamá Viejo. |
| destrees-aves-disaster-1678 | HIGH | Night of 11 May 1678. Navigational grounding, typed `storm` for want of a wreck type. Grammont's buccaneer contingent and subsequent Maracaibo raid per Crouse/Earle. Position: Las Aves reef, approximate. |
| battle-of-perico-1680 | HIGH | 23 Apr 1680 (St George's Day) per Ringrose. Of the named leaders (Coxon, Sawkins, Harris) only Sharp has a pirates.json id. Position: off Perico, Bay of Panama. |
| sack-of-veracruz-1683 | HIGH | 17–18 May 1683. De Graaf, Grammont, Yankey Willems all participated (all have ids). |
| spanish-razzia-new-providence-1684 | MEDIUM | Jan 1684 raid documented (commander's name appears variously as Juan de Alarcón / de Larco in secondary sources); 1686 follow-up raid noted in text. One entry covers the 1680s razzias as specified. |
| battle-of-samana-bay-1686 | HIGH (month) | Jun 1686, HMS Falcon and Drake vs Bannister. Bannister has no pirates.json id; wreck linked to `golden-fleece` (coords reused). His yardarm hanging was 1687, noted as aftermath. |
| port-royal-earthquake-1692 | HIGH | 7 Jun 1692, ~11:40 a.m. Death tolls (~2,000 immediate, ~3,000 after) are contemporary estimates. |
| tew-falls-red-sea-1695 | MEDIUM | Sept 1695; the disembowelling detail is Johnson (1724) and may be embellished — phrased as reported. Position: Bab-el-Mandeb, approximate. |
| every-takes-ganj-i-sawai-1695 | HIGH (date), MEDIUM (position) | ~7–8 Sept 1695. Action site "a few days short of Surat" — position (20.6 N, 70.0 E) is an honest open-sea approximation. |
| kidd-takes-quedagh-merchant-1698 | HIGH (date), MEDIUM (position) | 30 Jan 1698 off the Malabar coast (position approximate, off Cochin). Wrecks linked: `quedagh-merchant` (burned later at Hispaniola) and `adventure-galley` (Kidd's ship in the action, later scuttled at Sainte-Marie). |
| kidd-hanged-execution-dock-1701 | HIGH | 23 May 1701; broken-rope detail is in contemporary accounts. Position: Execution Dock, Wapping. |
| speaker-wrecked-mauritius-1702 | HIGH (month) | Early Jan 1702 (often cited 7 Jan). Position = wrecks.json `speaker`. Season "winter" by calendar convention though it is southern summer — see Conventions. |
| great-storm-goodwin-sands-1703 | HIGH | 26–27 Nov 1703 O.S. Stirling Castle linked; Restoration, Northumberland, Mary also lost (no wreck ids). Defoe's *The Storm* is the key contemporary source. |
| scilly-naval-disaster-1707 | HIGH | 22 Oct 1707 O.S. Death toll 1,400–2,000 depending on source; note says "near two thousand". Longitude Act (1714) link is standard (Sobel), though modern historians qualify the pure-longitude explanation. |
| wagers-action-san-jose-1708 | HIGH | 8 Jun 1708 N.S. Position = wrecks.json `san-jose`. ~600 dead per standard accounts. |
| zuytdorp-lost-1712 | MEDIUM | Lost mid-1712 between Cape and Batavia; exact date unknown (season null, year-only). Survivor-camp evidence per Playford. Position = wrecks.json `zuytdorp`. |
| plate-fleet-hurricane-1715 | HIGH | 31 Jul 1715 (N.S.). Eleven of twelve ships lost; ~1,000 dead is the conventional estimate. Position: mid-point of the wreck scatter; wrecks linked: `urca-de-lima`, `nuestra-senora-regla`. |
| jennings-raids-salvage-camps-1716 | HIGH (event), MEDIUM (details) | Jan 1716 (expedition began late Dec 1715 O.S.). 87,000 pieces of eight per Woodard; other sources up to 120,000. Vane's presence in Jennings' company is per Woodard — plausible, linked, flagged here. |
| whydah-storm-1717 | HIGH | Night of 26 Apr 1717. Two Whydah survivors (Thomas Davis, John Julian); six men tried at Boston Oct 1717 (mostly from the consort Mary Anne). Position = wrecks.json `whydah`. |
| blackbeard-blockades-charleston-1718 | HIGH | Late May 1718, ~5–8 days. Hostage Samuel Wragg documented. Bonnet was aboard the flotilla (effectively supplanted), so linked. Typed `battle` (a blockade; no better type). Position: off Charleston bar, approximate. |
| rogers-arrives-nassau-1718 | HIGH | Arrival 26–27 Jul 1718; Vane's fireship documented in Rogers' dispatches. Typed `battle` on the strength of the fireship action. |
| battle-of-cape-fear-1718 | HIGH | 27 Sept 1718. Bonnet's hanging (10 Dec 1718, White Point) folded into the note rather than a separate event. Wreck linked: `royal-james` (coords reused). |
| battle-of-ocracoke-1718 | HIGH | 22 Nov 1718 O.S. Blackbeard's actual ship at Ocracoke was the sloop Adventure; `queen-annes-revenge` (grounded Jun 1718 at Topsail/Beaufort Inlet) is linked as a contextual association for the app, flagged here. Position: Ocracoke Inlet. |
| nassau-pirate-hangings-1718 | HIGH | Hangings 12 Dec 1718; nine or ten of Auger's gang executed (one reprieved). This entry carries the required "Hornigold turns pirate-hunter" beat. |
| rackham-taken-off-negril-1720 | HIGH (within days) | Late Oct (some accounts 1 Nov) 1720, by Jonathan Barnet off Negril Point. The Bonny/Read fighting-on-deck detail is from trial testimony (Dorothy Thomas et al.). Bonny and Read have no pirates.json ids; only `jack-rackham` linked. |
| rackham-trial-spanish-town-1720 | HIGH | Trial 16–17 Nov 1720 at St Jago de la Vega (Spanish Town); Rackham hanged 18 Nov at Gallows Point; women tried 28 Nov, pleaded their bellies. Source: the 1721 printed trial. |
| vane-hanged-gallows-point-1721 | HIGH (date convention) | 29 Mar 1721 (sometimes given 1720 O.S. year-start). Gun Cay gibbeting per Johnson. |
| capture-nossa-senhora-do-cabo-1721 | HIGH (month) | Apr 1721 (8 or 20 Apr in different sources), in the road of Saint-Denis, Bourbon (Réunion). "Richest prize" claim phrased as "perhaps". Edward England not linked (already deposed/marooned). |
| battle-of-cape-lopez-1722 | HIGH | 10 Feb 1722. Crimson damask and burial-at-sea details from Johnson, widely accepted. |
| cape-coast-castle-trials-1722 | HIGH | Mar–Apr 1722; 52 hanged, ~20 sentenced to servitude in the mines (most died), of 264 tried. Largest mass pirate execution of the era (Rediker). |
| low-fights-greyhound-1723 | HIGH | 10 Jun 1723 off Block Island/Long Island east end (position approximate). Chosen as the single representative event of Low's 1722–24 rampage as specified; 26 hanged at Newport 19 Jul 1723. |
| la-buse-hanged-reunion-1730 | HIGH (date), note on legend | 7 Jul 1730 at Saint-Paul, Bourbon (coords at Saint-Paul, not the linked `saint-denis` port). The cryptogram story is explicitly framed as legend, not record. Season "summer" by calendar convention (southern winter). |

## Deliberate exclusions
- **1733 plate fleet** (`san-pedro-1733`, `el-rubi-capitana-1733`): outside the 1650–1730 window, excluded as instructed.
- **Bonnet's hanging** and **QAR grounding**: folded into Cape Fear and Charleston/Ocracoke notes respectively rather than standalone events, to keep the count near 35.
- **Henry Jennings, Anne Bonny, Mary Read, Joseph Bannister, John Coxon, Richard Sawkins, Woodes Rogers, Maynard, Rhett, Barnet, Ogle, Wager, Shovell, d'Estrées**: named in notes/captions but not linked — no matching ids in `data/timeline/pirates.json`.

## Decade coverage (38 events)
1650s: 2 · 1660s: 4 · 1670s: 2 · 1680s: 4 · 1690s: 4 · 1700s: 5 · 1710s: 9 · 1720s: 7 · 1730: 1

## Tours
- Coordinates of tour centers follow the same approximations as events; Île à Vache (-73.66, 18.07), San Lorenzo/Chagres mouth (-80.02, 9.32), Cape route waypoint (19, -35) and Florida Strait waypoint (-80, 25.5) are scenic/navigational centers, not event sites.
- All captions avoid invented quotations; the boiled-leather march, fireship dressed with logs, "flag of King Death" phrase (a period usage noted by Rediker), and Gardiners Island cache are sourced details from Exquemelin, Earle, Rediker, Woodard and Zacks respectively.
