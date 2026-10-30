# 01 Frontend

Terug naar [[00 Overzicht]] · Hangt af van: [[04 API's]] (eigen HTTP-contract)

## Plan
**Doel:** één dashboard waarin een penningmeester ziet wat de agent doet, waarom iets is toegestaan of geblokkeerd, en waar ze moet ingrijpen. Design telt voor 20% van de jurering, en de video is de pitch: elk scherm moet in 5 seconden te begrijpen zijn zonder geluid.

**Requirements per pijler**
| Pijler | Scherm | Moet tonen |
|---|---|---|
| 1 | Purchasing | policy-kaart, opdrachtveld, live agent-stream, voorstel, checklist R1–R10 die per regel groen/rood wordt, bon of BLOCKED-scherm |
| 3 | Disputes | queue met deadline, bewijsoverzicht, gegenereerd dossier (bewerkbaar), knop "goedkeuren en indienen" |
| 2 | Invoices | factuur plakken/uploaden, oordeel (SAFE/SUSPICIOUS/SCAM), gemarkeerde signalen in de tekst, knop "blokkeer ontvanger" |
| alle | Audit | AG Grid met alle beslissingen, filter op pijler/uitkomst/regel, detail per rij |
| alle | Overzicht (`/`) | drie kaarten met open acties ("1 dispute wacht", "1 factuur verdacht"), maandbudget |

**Acceptatiecriteria**
- Scène 1 en 2 uit het [[Video-draaiboek]] zijn zonder uitleg te volgen.
- Elke status heeft een lege staat, laadstaat en foutstaat.
- Werkt op 1920×1080 (video) en op mobiel (goedkeuren via telefoon).
- WCAG 2.2 AA: accesslint-scan zonder blokkerende fouten; kleur is nooit de enige drager van betekenis (altijd ook icoon + tekst).

**Buiten scope:** login, meerdere gebruikers, meertaligheid (UI in het Engels voor de jury), eigen grafiekbibliotheek.

## Design
**Visuele richting:** rustig, financieel-betrouwbaar, met één scherpe accentkleur voor BLOCKED. Skills inzetten: `impeccable` en `frontend-design` voor de richting, `emil-design-eng` voor polish, `animate` voor de checklist-animatie. Expliciet aanroepen als het past: `/prototype` voor 2–3 varianten van het Purchasing-scherm, `/review-animations` na de polish.

**Design tokens** (Tailwind v4 `@theme`): `--color-allow`, `--color-block`, `--color-approval`, `--color-surface`, `--color-ink`, spacing- en typeschaal. Dark mode niet nodig voor de demo, wel tokens zo opzetten dat het later kan.

**Componenten (shadcn/ui als basis)**
- `PolicyCard`: regels als leesbare zinnen ("Max €350 per purchase"), met regel-ID ernaast.
- `AgentStream`: tijdlijn van agent-stappen (zoeken, vergelijken, voorstel), gevoed door SSE.
- `RuleChecklist`: per regel verwacht / gevonden / bron; animeert regel voor regel bij binnenkomst.
- `DecisionBanner`: ALLOWED / BLOCKED / NEEDS APPROVAL, groot genoeg voor de video.
- `Receipt`: "wat is gecontroleerd", met PayPal-order-ID en capture-ID.
- `DisputeDossier`: secties met bewijsstukken, elk met bron en tijdstempel.
- `InvoiceVerdict`: factuurtekst met gemarkeerde signalen (tooltip: welke regel/waarom).
- `AuditGrid`: AG Grid-wrapper met vaste kolomdefinities.

**AG Grid-keuze:** Community-editie (gratis, geen watermerk). Master-detail en row grouping zijn Enterprise; daarom: klik op rij → zijpaneel met de volledige `checks[]`. Vraag de sponsor om een hackathon-sleutel; komt die er, dan master-detail als upgrade.

**Data ophalen**
- Server Components lezen direct via de services (geen eigen fetch naar de eigen API).
- Mutaties via Server Actions of `POST /api/...` (zie [[04 API's]]).
- Agent-run: `EventSource` op `/api/runs/:id/stream`. Events: `step`, `proposal`, `check`, `decision`, `payment`, `error`.
- Geen client-state-library; `useState` + server-revalidatie is genoeg.

## Structure
```
src/app/
  layout.tsx                 shell, navigatie
  page.tsx                   overzicht
  purchasing/page.tsx        pijler 1
  purchasing/[runId]/page.tsx  één run teruglezen (ook voor de video)
  disputes/page.tsx          pijler 3, queue
  disputes/[id]/page.tsx     dossier
  invoices/page.tsx          pijler 2
  audit/page.tsx             AG Grid
  shops/...                  bestaande demowinkels (ongewijzigd)
src/components/
  ui/                        shadcn-componenten (gegenereerd, niet handmatig aanpassen)
  purchasing/  disputes/  invoices/  audit/   feature-componenten
src/hooks/useRunStream.ts    SSE-client met reconnect
```
**Conventies:** componenten in PascalCase, één component per bestand; `"use client"` alleen waar nodig (stream, grid, formulieren); geen data-logica in componenten, alleen weergave.

**Bouwvolgorde:** shell + tokens → Purchasing (2-11) → Audit grid → Disputes (4-11) → Invoices (6-11) → polish (7-11).

## Scale
**Voor de demo**
- "Reset demo"-knop zichtbaar in de header (roept `POST /api/demo/reset` aan).
- Vaste viewport voor opnames: browserzoom 125%, geen scrollbalken in de belangrijke schermen.
- Skeletons in plaats van spinners, zodat versnelde opnames rustig ogen.

**Na de hackathon**
- Auth + rollen (penningmeester, bestuur, lid) en goedkeuringsflows per rol.
- Multi-tenant (koppeling met [[Business Ventures/Clubplatform/README|Clubplatform]]).
- AG Grid Enterprise of server-side row model zodra het auditlog groot wordt.
- PWA/push voor goedkeuren op de telefoon; i18n (NL/EN).
