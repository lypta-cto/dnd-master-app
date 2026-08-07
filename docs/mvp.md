# DM Master — plan razrade

Tri površine, tri posla:

| Površina | Ko | Posao |
| --- | --- | --- |
| **DM aplikacija** | Ti | Sve: prep, vođenje sesije, kontrole |
| **Cast displej** | Sto (TV / drugi ekran) | Samo ono što DM izabere da pokaže |
| **Igrački pogled** | Igrači | Njihov sheet + podeljeni lore. Papir ostaje glavni |

Temelj (gotovo, provereno): jedna `entity` kičma za sve tipove, `[[wiki linkovi]]` iz
proze → pravi linkovi + backlinkovi, full-text pretraga sa težinama, vidljivost
`dm_only/shared/public` na svakom entitetu, cast kanal preko SSE sa display tokenom.

---

## Faza A — dubina sadržaja *(A1–A4 gotovo)*

Ono što kampanju čini stvarnom, ne demo-om.

- **A1. Tipizovana polja po tipu** — NPC: rasa, zanimanje, status (živ/mrtav/nestao),
  glas/manir; lokacija: vrsta, region; predmet: retkost, attunement; frakcija: cilj,
  vođa. Sve u postojećem JSONB `data` — bez migracija, samo forma i prikaz.
- **A2. Slideshow cast** — više slika u rotaciji sa natpisima i intervalom; DM bira
  entitete sa slikama i kastuje ceo set (uvod u sesiju, "previously on…").
- **A3. Stranica kampanje** — izmena imena/opisa, lista članova, pozivanje igrača po
  emailu, uklanjanje, uloge. Backend postoji; UI fali.
- **A4. Galerija po entitetu** ✓ — više slika po entitetu sa natpisima; prva postaje
  cover, bilo koja se kastuje ili ulazi u slideshow; brisanje briše tačno taj fajl i
  cover se sam prebaci na sledeću.
- **A5. Preimenovanje sa prepravkom referenci** ✓ — preimenovanje automatski
  prepravlja `[[stare reference]]` po telima (labela u `[[Ime|labela]]` preživi) i
  ponovo razrešava prozu koja je već pominjala novo ime; UI javi koliko je unosa
  izmenjeno.

## Faza B — igrači i karakteri *(B1 gotovo)*

- **B1. Karakter kao entitet** ✓ — tip `character` sa `owner_id`; igrač kreira i
  menja samo svog (vidljivost ne), vlasnik uvek vidi svoj sheet ma kako sakriven.
  Sheet je tracker sa autosave-om: HP/temp (šteta prvo jede temp), spell slotovi po
  nivou, stanja, inspiracija, death saves. Bez rules engine-a — papir je izvor istine.
- **B2. Igrački dashboard** — moj karakter + podeljeni lore + poslednji recap. To je
  90% onoga što igrač ikad vidi.
- **B3. Party pregled** ✓ — `/party`: svi karakteri sa HP barom, stanjima, AC/level;
  brzo ±HP direktno sa pregleda (temp se troši prvi), optimistički update. DM svuda,
  igrač na svom. Sesija uz to ima Mark-as-played/Reopen tok sa svoje stranice.

## Faza C — vođenje sesije

- **C1. Statblokovi** ✓ — tip `monster`: kind/CR/AC/HP/speed/abilities kao polja,
  akcije u markdown telu. Podrazumevano dm_only.
- **C2. Combat tracker** ✓ — `/combat`: dodavanje partije jednim klikom (HP sa
  sheeta), čudovišta sa auto-numeracijom kopija, custom redovi; inicijativa, runde,
  next/prev, ±HP, brza stanja. Šteta karaktera se upisuje nazad u sheet. **Cast mod
  `initiative`** uživo: sto vidi redosled, ko je na potezu i ko je pao — nikad HP.
  End combat čisti displej.
- **C3. Sesije** ✓ *(povučeno napred)* — tipovi `session` (broj, datum,
  planned/played; prep i recap u telu sa `[[linkovima]]`) i `quest` (status, davalac,
  nagrada). **Dashboard je glava priče**: poslednji recap sa živim linkovima, sledeća
  planirana sesija, party sa HP, otvoreni questovi. Ostaje: checklist UI za prep.
- **C4. Brze beleške** ✓ — ⌘J bilo gde: prva linija je naslov, `[[imena]]` se sama
  linkuju, snima se kao dm_only `note` sa tagom `table-note`; ⌘↵ i nazad u igru.

## Faza D — mape i svet

- **D1. Mape** ✓ — tip `map`: cover slika + pinovi u procentima (klik-postavljanje,
  pin → entitet iz pretrage ili slobodna labela). Cast mod `map`: sto vidi sliku i
  samo pinove čiji je entitet shared/public — dm_only pinovi se filtriraju pri castu,
  labele prolaze. Bez fog of war i tokena — nije virtuelni sto.
- **D2. Kalendar sveta** *(opciono)* — in-world datum na sesijama i beleškama.

## Faza E — završnica

- **E1. Audio (poslednje, dogovoreno)** — linkovanje YouTube/Spotify plejliste po
  sceni/lokaciji. Embed + URL polje; bez hostovanja fajlova.
- **E2. Handouts** — entitet/slika označen kao handout, igrači ga vide u svom pogledu
  kad ga "predaš" (visibility flip + notifikacija).
- **E3. Kockice na displeju** ✓ — DiceRoller (NdM±K, brzi tasteri) na cast i combat
  stranici; Roll u tajnosti ili Roll & cast — displej mesa brojeve pa se skrasi na
  užarenom totalu sa raspisom. Combat uz to ima "Roll the rest" za praznu inicijativu.

## Doterivanje pre Neon deploy-a

**Prolaz 1** ✓ — intuitivnost oko slika i brojeva:

- Lightbox: klik na sliku u galeriji ili na cover u headeru → pun prikaz preko
  celog ekrana, sa natpisom.
- Crop focus: dugme u galeriji otvara birač — klikneš gde je "bitno" na coveru i
  kartice/header seku sliku oko te tačke (`data.cover_focus` → `object-position`).
- Upload: drag & drop preko cele Gallery kartice + ⌘V nalepljene slike.
- Sheet: direktan unos trenutnog HP-a, polje za proizvoljan iznos (Dmg/Heal,
  temp prvo), **Long rest** dugme (HP na max, temp 0, slotovi resetovani, death
  saves obrisani — uz potvrdu), lečenje sa 0 HP briše death saves.
- Combat: direktan unos HP-a na svakom redu pored ± dugmića.
- Slideshow: Select all / Clear.

**Prolaz 2** ✓ — redosled, resursi, brzi statusi:

- Galerija: prevuci thumbnail na drugo mesto → redosled se čuva (`position` PATCH).
- Sheet: **Resources** — proizvoljni brojači (Ki, Rage, Bardic…) sa kvadratićima kao
  slotovi, totalom i SR/LR prekidačem; **Short rest** dugme obnavlja SR resurse
  (dijalog kaže šta tačno vraća), Long rest obnavlja sve.
- Dashboard: status questa menjaš iz badge-a na Open threads (dropdown, bez
  napuštanja stranice — completed odmah nestaje iz liste); planirana sesija ima
  **Mark played** koji je odmah pretvara u recap karticu.

**Prolaz 3** ✓ — greške, masovne izmene, provera vidljivosti:

- Borba: **undo** (dugme + ⌘Z) — svaka izmena snima celo stanje pre sebe, a niz
  klikova na isto stvorenje se sabija u jedan korak, pa undo vraća odluku a ne
  klik. Vraćeno stanje se odmah snima na server. Istorija drži 30 koraka.
- Liste entiteta: **Select** režim — obeležiš više kartica i jednim potezom im
  postaviš vidljivost (DM only / Shared / Public). Klik u tom režimu bira umesto
  da otvara (capture faza, pre NuxtLink navigacije).
- **Player view** na svakom entitetu (DM): modal pokazuje tačno šta igrač vidi.
  dm_only entitet → "igrači ne vide ništa" (API im vraća 404); inače telo sa
  linkovima koji se za njih ne razrešavaju kao običan tekst, uz spisak koliko
  pominjanja ostaje skriveno. Sve se računa iz podataka koje je API već poslao,
  po istom pravilu kao `visibility_filter` na backendu.
- "Mentioned in" grupisan po tipu sa brojem, i dm_only bedž na pominjanjima koja
  igrači ne bi videli.

**Prolaz 4** ✓ — prolazak kroz aplikaciju očima igrača (pravi nalog, član kampanje,
sopstveni lik). Nađeno i popravljeno:

- **Curenje sesije pri odjavi.** `campaigns` (sa `my_role`) je preživljavao odjavu,
  pa je sledeći nalog u istom tabu nasleđivao prethodnu ulogu — DM-ova dugmad na
  igračevom ekranu, sve do punog reload-a. Sada se stanje po nalogu briše na
  prijavi, registraciji i odjavi (`useAuth`, ne `useAuthState` — taj sloj ostaje
  bez zavisnosti).
- **Campaign stranica je bila otvorena igraču** sa poljima za izmenu i linkom na
  cast ekran. Sada DM vidi podešavanja, igrač read-only "About" + spisak igrača.
- **Undo u borbi nije vraćao HP na sheetove** — tracker bi se vratio, a party
  stranica i igračev pogled ostajali na staroj šteti. Undo sada vraća i sheetove.
- **Galerija je bila DM-only, iako igrač sme da menja svoj lik** — nedosledno sa
  `_can_write`. Rute za slike sada koriste isto pravilo (`_load_writable`), pa
  igrač može da doda portret svom liku, a tuđ entitet i dalje odbija (403, ili
  404 za dm_only — postojanje se ne odaje). Dva nova testa.
- Šum u navigaciji i tekstu: bestijarij i brojač monstruma sakriveni igračima,
  liste kažu "Shared with you in …" umesto "Everything in …", prazno stanje više
  ne piše "No npcs yet".

### Namerno van plana (za sada)

Rules engine i uvoz SRD podataka · character builder · virtuelni sto (fog of war,
tokeni) · glasanja igrača · real-time kolaboracija u pisanju · mobilna aplikacija.
Sve se može dodati kasnije, ništa od toga ne blokira gore navedeno.

### Tehnički dug koji čeka pravi trenutak

- E2E test za cast tok (SSE) — sad je pokriveno ručnom proverom
- Postgres LISTEN/NOTIFY umesto in-memory brokera kad backend dobije više workera
- Slike na S3/R2 pre produkcije (lokalni disk je jednomašinski)
- Neon baza + deploy — kad kažeš da izlazimo iz lokalnog razvoja
