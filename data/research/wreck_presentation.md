# Making Shipwrecks Compelling on an Antique Map — Idea Memo

How games sell shipwrecks, translated to our engraved-1730s aesthetic (no 3D, no neon, no modern UI chrome). Priorities: **H** = implement now, **M** = next pass, **L** = backlog.

## 1. Circling gulls over fresh wrecks — *Sea of Thieves* — **H**
SoT marks every wreck with seagulls circling floating debris; players scan the horizon for birds, not icons. **Ours:** tiny engraved gulls (2–3 stippled "ᵛ" birds in period engraving style) hovering above wrecks lost within ~15 years of the map date, with a very slow drift/flutter (CSS transform, no sprite sheet). Recent loss = birds; old loss = bare symbol. *Effort: one small SVG group + a `year` threshold; half a day.*

## 2. "Ship's Manifest" hover card — *Return of the Obra Dinn* — **H**
Obra Dinn proves a cargo/crew manifest is the strongest narrative hook in the genre — names, counts, and fates do the storytelling. **Ours:** hover/tap card styled as a ruled ledger page: ship name in blackletter, then `Souls aboard — lost — saved` as a tally row, 3–6 manifest lines ("180 sacks of coin…"), and the epitaph in italic at the foot. Data already in `wrecks_enrichment.json`. *Effort: one card template; a day.*

## 3. Precision-coded wreck symbology — *Sid Meier's Pirates!* quadrant maps — **H**
Pirates! taught players to read partial maps: certainty itself is the game. **Ours:** encode the existing `precision` field visually — `exact` = engraved broken-hulk symbol; `approximate` = a hand-drawn ✕; `general-area` = a hatched "wreckage reported hereabouts" oval with no point at all. Honest cartography reads as period cartography. *Effort: 3 symbols + style switch; half a day.*

## 4. Cluster badge as treasure-map medallion — *Pirates!* / *AC IV* — **H**
Instead of a numeric cluster bubble, a parchment medallion: a large ✕ with "×5" in engraver's numerals, rope-border ring (1715 fleet, 1733 fleet, Samaná Bay, Île Sainte-Marie clusters). *Effort: restyle existing cluster renderer; hours.*

## 5. Depth dread via tone — *Subnautica* — **M**
Subnautica makes depth itself the emotion. **Ours:** ink weight and wash by `depth_m`: shallow wrecks (Whydah ~5 m) crisp and dark; San José at ~600 m printed faint, half-swallowed in wave-hatching, label reading "600 fathoms of night" style. One number drives one opacity/hatch ramp. *Effort: small; needs depth data (now provided).*

## 6. Debris ring + soundings at close zoom — *AC IV: Black Flag* diving-bell sites — **M**
AC IV dresses wreck sites with a debris field and danger (sharks). **Ours:** at high zoom, draw a faint dashed debris-scatter ring sized by `condition` (scattered vs. intact) and 2–3 tiny period soundings ("3½ fm") around it; optionally one engraved shark fin on the deep, dangerous sites (San José, Sussex) — keep it subtle or it goes theme-park. *Effort: a day; zoom-gated layer.*

## 7. Waterlogged captain's log panel — *Sea of Thieves* journals — **M**
SoT's wrecks pay off with a soggy journal aboard. **Ours:** the detail panel renders the existing `story` as a stained logbook page — drop cap, foxed-paper texture, "found among the wreck" framing, with `discovery` as a modern marginal note in a different hand. *Effort: CSS/typography only; a day.*

## 8. Salvage ledger: then vs. now — *Uncharted Waters* trade ledgers — **L**
Two-column ledger row: period value ("£20,000 by survivor testimony") against modern estimate ("$400m"), plus a one-line salvage chronicle (Lethbridge's barrel 1725 → Sténuit 1974). Quietly tells the 300-year second story every wreck has. *Effort: trivial once card exists.*

## 9. Diving-bell badge for salvaged wrecks — *AC IV* — **L**
Tiny engraved diving-bell glyph on wrecks that were historically salvaged (Maravillas, Slot ter Hooge, 1733 fleet) — the period's own treasure hunting was real and is great trivia. *Effort: one glyph + boolean.*

**Implement now:** 1, 2, 3, 4. **Next:** 5, 6, 7. The unifying rule: every game gimmick must be restated as something an 18th-century engraver could plausibly have put on the plate.
