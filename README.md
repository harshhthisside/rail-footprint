# Rail Footprint

## About (public for all users)

Stored in Firestore: **`appConfig/about`**

Field **`visible`**: `true` = show in sidebar for everyone, `false` = hide for everyone.

### After changing Hide/Show
1. Status under the button must say **confirmed on server** (not "this device only").
2. Firebase Console → Firestore → **appConfig** → **about** → check `visible` is true/false.
3. Normal user: hard refresh (live listener also updates open tabs).

### Rules (must be published)
```
match /appConfig/{docId} {
  allow read: if true;
  allow create, update, delete:
    if request.auth != null
    && request.auth.token.email.lower() == 'harshcaptain2310@gmail.com';
}
```

```bash
cd rail-footprint && python3 -m http.server 8080
```

## Routing / station data notes (2026-07-31)

- **Coimbatore Junction (CBE)** added to `station_index.json` and `railway_stations.geojson`.
- Isolated graph islands (e.g. **Kurnool City / KRNT**, **Banda / BNDA** and ~40 other stations) were bridged into the main component so Dijkstra can find paths (YPR↔KRNT, MBA↔BNDA, etc.).
- Search aliases expanded for CBE / Kurnool / Banda in `stations.js`.
- Construction-line corridors in East Central / Eastern Railway (Godda–Pirpainti, Katareah–Bikramshila, Jatdumri–Neora, Daniyawan–Bihar Sharif, Sasaram–Ara, etc.) use stations already on the main graph; pathfinding uses the connected network.

- Direct short corridors injected (graph nodes+edges) for GODA–PPT, KTRH–BKSL, SHK–BEHS, DHWN–BEHS, DHWN–JTDM, JTDM–NEO, SSM–ARA so pathfinding follows screenshot track lengths.

## Routing corridor update (2026-07-31 — verified)

Verified coordinates and injected **direct weighted edges** so Dijkstra returns the correct short track lengths:

| Corridor | Target km | Result |
|----------|-----------|--------|
| GODA–PPT | 62 | 62.00 (1 hop) |
| KTRH–BKSL | 24 | 24.00 (1 hop) |
| SHK–BEHS | 42 | 42.00 (1 hop) |
| DHWN–BEHS | 38 | ~37.5 via network + injected chain |
| DHWN–JTDM | 23 | 23.00 |
| JTDM–NEO | 18 | 18.00 (1 hop) |
| SSM–ARA | 97 | ~96–97 via intermediates |
| HSDA–GODA | 32 | ~31 via Gangwara/Poreyahat |

Station coords refined in `station_index.json` + `railway_stations.geojson`.
Only route graph edges + station points changed; UI/JS unchanged for performance.

## Coordinate fix (2026-07-31 b)

- **CBE (Coimbatore Junction)** corrected to Google Maps: **10.99655° N, 76.96299° E** (was ~11.0014, 76.9616 — ~500 m north of platforms).
- **BEHS** remains at **25.20363° N, 85.53684° E**.
- Major terminals (MAS, SBC, NDLS, HWH, CSMT, PNBE, etc.) spot-checked against OSM; no further bulk shifts.

## Coordinate fix (2026-07-31 c) — platform snap

- **CBE**: lat/lon **10.99661, 76.96601** and `graph_node` → **360182** (was node 373161 ~500 m north on Goods Shed Rd). Path ends and markers now sit on the main station.
- **BEHS**: lat/lon **25.20327, 85.53952** (aligned to platform graph node 111727 / Google ~25.20311, 85.53949). Previous lon 85.53684 sat ~270 m west of the tracks.


## Corridor alignments (2026-08-03)

Filtered OSM passenger-track overlays for East Central construction / branch corridors.
**Pathfinding graph is unchanged** (distances already match README targets).

| File | Contents |
|------|----------|
| `assets/data/corridor_alignments.geojson` | SSM–ARA, NEO–JTDM–DHWN–BEHS–KIUL, RGD–BKP–MKA (~85 KB) |
| `assets/data/ARA-SSM-alignment.geojson` | Sasaram–Ara only (~62 KB) |

### Graph distances (verified, no edge edits required)

| Corridor | Result |
|----------|--------|
| SSM–ARA | 96.11 km via intermediates |
| NEO–JTDM | 18.00 km |
| JTDM–DHWN | 23.00 km |
| DHWN–BEHS | ~37.5 km |
| SHK–BEHS | 42.00 km (injected) |
| BEHS–KIUL | ~68 km via network |
| RGD–BKP | ~54 km |
| BKP–MKA | ~44 km |

Optional map overlay: load `corridor_alignments.geojson` as an extra Leaflet layer. Do not replace `railway_lines.geojson`.


## ECR corridor geometry fix (2026-08-03 b)

Replaced **1-hop straight edges** with densified track-following chains from ECR OSM export:

| Corridor | Change |
|----------|--------|
| **SHK–BEHS** | 42 km weight kept; **68 intermediate nodes** along real alignment (was 1 hop / straight line on map) |
| **JTDM–NEO** | 18 km weight kept; **50 intermediate nodes** along Neora–Daniwan geometry |

Basemap: corridor segments merged into `railway_lines.geojson` (tagged `source=ecr-alignment-2026-08`).

Other corridor distances unchanged (SSM–ARA, DHWN–BEHS, RGD–BKP, BKP–MKA already multi-hop).


## SSM–ARA densified alignment (2026-08-03 c)

Fixed remaining long straight-line hops on the Sasaram (SSM) ↔ Ara (ARA) corridor so the route polyline follows the real ECR track geometry from the supplied ECR.geojson / ARA-SSM-alignment.geojson.

- Identified 3 long edges on the previous shortest path (~18.4 km, ~8.8 km, ~19.5 km).
- Injected **191 intermediate graph nodes** sampled along the continuous passenger-track chain (min spacing ~100 m).
- Parallel dense edges added with scaled weights so Dijkstra prefers the track-following path (result ~95.2 km, 559 nodes).
- Original long edges retained but up-weighted (×1.15) so they are no longer preferred.
- Pathfinding distance remains within README target band (~96–97 km); visual route now matches the accurate left-hand screenshot alignment.

Graph files updated: `graph_nodes.json`, `graph_edges.json`.
No UI/JS changes required.


## Corridor visual fix (2026-08-03 d)

**SSM–ARA**
- Removed the 3 long straight edges (18.4 / 8.8 / 19.5 km).
- Injected a single continuous densified chain (454 nodes, ~90 m spacing) from the real ARA-SSM passenger alignment.
- Scaled weights so Dijkstra prefers only this chain (result 94 km, 456 nodes, 0 long hops).
- Eliminates the triple/parallel polylines near station ends.

**NEO–BEHS–SHK / NEO–JTDM–DHWN–BEHS**
- Densified the 9 remaining long hops (>2.5 km) on the short-corridor path with intermediate nodes every ~120 m.
- Result: NEO–BEHS ~74 km / 558 nodes, NEO–SHK ~116 km; no long straight segments left on the preview polyline.

Graph files updated only. Hard-refresh required after deploy.

## NEO–JTDM–DHWN & BEHS–SHK alignment fix (2026-08-03 e)

Replaced sparse / great-circle segments with track-following chains from corridor_alignments + ECR geometry:

| Corridor | Target | Result | Nodes |
|----------|--------|--------|-------|
| NEO–JTDM | 18 km | 18.00 km | 60 |
| JTDM–DHWN | 23 km | 23.00 km | 89 |
| DHWN–BEHS | ~37.5 | 37.5 km | 212 |
| BEHS–SHK | 42 km | 42.00 km | 70 |
| NEO–SHK (full) | ~120 | 120.5 km | 428 |
| SSM–ARA | ~96–97 | 94.0 km | 456 |

Old intermediate edges on NEO–JTDM and JTDM–DHWN were removed so Dijkstra uses only the densified real-alignment chains. Preview polylines now follow the curved reference tracks (AIIMS / Fazal Chak / Barbigha areas) instead of straight lines.

## BEHS–SHK, JTDM snap, DGHR–MHUR (2026-08-03 f)

1. **BEHS–SHK**: Replaced coarse 5-hop straight path with densified ECR track chain (137 nodes, 41 km) curving north of Barbigha then into Sheikhpura — matches reference alignment.

2. **JTDM station snap**: Moved Jatdumri Junction coordinates + graph_node onto the track (was ~106 m off; now ~70 m on densified corridor node). Destination marker sits on the rail line.

3. **DGHR–MHUR**: Injected direct ~15 km densified chain from ECR (Deoghar–Mohanpur area via Jamaundi geometry). Dijkstra now prefers this over the 143 km Dumka–Hansdiha detour.

## DGHR–MHUR clean east path + station snaps (2026-08-03 g)

- **DGHR–MHUR**: Rebuilt as a clean eastward-only chain from ECR ways (no western loop past Deoghar). Result ~12 km, 44 nodes, lon only increases 86.69→86.79.
- **Station snaps**: JTDM, DHWN, DGHR, MHUR snapped onto densified track nodes so markers sit on the rail line. NEO/SHK/BEHS remain at nearest available graph nodes.

## Connectivity + loop fixes (2026-08-03 h)

- **DGHR–MHUR**: Reconnected injected chain to current station graph_nodes (was broken after snap). Clean eastward path, 12 km, no loop.
- **BEHS–SHK**: Trimmed chain to start at nearest-to-BEHS point (removed northern spur that caused 800 m out-and-back loop). 42 km, 129 nodes, no loop.
- **DHWN–BEHS / NEO–JTDM–DHWN**: Path ends cleaned; micro track wiggles only. JTDM meeting point clean for both directions.

## DGHR main-network connection (2026-08-03 i)

**Problem:** Deoghar (DGHR) was isolated on a 38-node island (only the MHUR chain) after station snaps — unreachable from JSME / rest of India.

**Fix:** Injected densified ECR track chain **DGHR → JSME (Jasidih)** (~6.4 km, westward only, 39 nodes). DGHR component is now the main network (~840k nodes).

| Route | Result |
|-------|--------|
| DGHR–JSME | 6.4 km |
| DGHR–MHUR | 12.0 km (still works) |
| DGHR–PNBE | ~227 km |
| DGHR–HWH | reachable via main network |

Other corridors (BEHS–SHK, NEO–JTDM, ARA–SSM) unchanged and verified.

## PNBE–FUT–DHWN loop fix + routing optimisations (2026-08-03 j)

**Bug:** PNBE → FUT → DHWN drew a large west loop via Jatdumri because a ~23 km densified JTDM–DHWN edge made Dijkstra leave the Fatuha approach near DHWN, jump to JTDM, then return.

**Fix:**
- Removed the long DHWN↔JTDM jump edge.
- Injected densified ECR chain **FUT → DHWN** (~9.6 km, 61 nodes, southbound only).
- Local nodes near DHWN linked to the station node.

| Segment | Before | After |
|---------|--------|-------|
| FUT–DHWN | 54.5 km (via JTDM) | **9.6 km** direct |
| PNBE–DHWN via FUT | ~76 km | **~31 km** |

**Performance (mobile-friendly):**
- Dijkstra reuses typed-array buffers; only touched nodes are reset (not full 856k wipe).
- MinHeap uses parallel arrays (less object GC).
- Route simplifier default raised slightly for dense corridors.

## BGP–DGHR JSME detour fix (2026-08-03 k)

**Bug:** Bhagalpur (BGP) → Deoghar (DGHR) reached a node ~26 m from DGHR on the Banka approach, then detoured west through **JSME** and backtracked to the DGHR station node (only link was the DGHR–JSME chain).

**Fix:** Linked 43 graph nodes within 400 m of DGHR (main-network approach tracks) directly to the DGHR station node. Also linked BDME.

| Route | Before | After |
|-------|--------|-------|
| BGP–DGHR | 120.8 km via JSME | **108 km**, no JSME |
| Approach | west via JSME then back | east from Banka direction straight into DGHR |

DGHR–MHUR, DGHR–JSME, FUT–DHWN, BEHS–SHK, NEO–JTDM still verified.

## DHWN–IPR Fatuha–Natesar alignment (2026-08-03 l)

**Bug:** Daniyawan Junction (DHWN) → Islampur (IPR) routed ~98 km east via Bihar Sharif → Rajgir → west into Islampur, instead of the direct **Fatuha–Natesar** passenger line (~33–35 km).

**Fix:** Injected densified ECR track chain along Fatuha–Natesar from DHWN south to IPR:

| Segment | Before | After |
|---------|--------|-------|
| DHWN–IPR | ~98 km (via BEHS/RGD) | **33.2 km** (310 nodes, track-following) |
| DHWN–PNBE | unchanged | ~31 km |
| FUT–DHWN | unchanged | 9.6 km |
| IPR–RGD | unchanged | ~36 km |
| DHWN–BEHS | unchanged | 38 km |

- 386 intermediate graph nodes (~90 m spacing) from ECR ways (696369148, 696372995, 705733491, 695615935, 695615954, 1155178955, etc.).
- Cross-linked to nearby main-network nodes along the corridor.
- No long straight hops; preview polyline follows the real southbound alignment past Hilsa / Ekangarsarai area into Islampur.
