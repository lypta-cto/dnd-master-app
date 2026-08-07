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

## Kampanja kao sistem — korak 1: igrači i likovi ✓

Osoba za stolom više nije nalog. `players` tabela po kampanji (ime, kontakt,
iskustvo, šta ga vuče: combat/roleplay/puzzles/exploration), a `user_id` na njoj
je opcion i uglavnom prazan. Lik dobija `player_id` — čiji je za stolom —
odvojeno od `owner_id`, koji i dalje jedini određuje ko sme da menja. Zato DM
unese osmoro ljudi za minut, bez ijedne registracije.

Nalog dolazi kasnije ili nikad: poziv na adresu koja već ima nalog odmah povezuje
i predaje mu njegove sheetove; poziv na adresu bez naloga se pamti, pa
registracija preuzima mesto. Prebacivanje lika na mesto bez naloga oduzima pravo
izmene, brisanje igrača ostavlja likove u kampanji.

U UI-ju: „The table" na Campaign stranici (brzi unos imena, meni po redu za
Edit / Invite / Remove), izbor igrača u formi lika, i „played by …" na Party
stranici.

## Korak 2: metapodaci i otvaranje kampanje ✓

Kampanja je dobila `data` JSONB (isti obrazac kao entiteti): tip (one-shot /
mini / campaign), sistem, broj igrača, starting level, očekivano trajanje, žanr,
ton — i kičmu priče: premise, DM truth, villain, twist, plus tekst za čitanje
igračima na početku.

Ključno: **`dm_` ključevi se skidaju na izlazu iz API-ja** (`visible_data`), pa
istina stoji odmah pored premise u bazi a nikad ne putuje sa njom. Radi se na
granici serijalizacije, ne po ekranu, da nijedna buduća stranica ne može da ih
procuri time što je zaboravila da filtrira — isti argument kao `visibility_filter`
jedan nivo niže.

**Wizard** za otvaranje kampanje ima četiri koraka koja prate kako se o kampanji
zaista razmišlja: The game → The premise → The truth → The table. Sve posle imena
može da se preskoči („Create now"), a poslednji korak odmah unese ljude za stolom.
Ista podešavanja se posle menjaju na Campaign stranici; igrač tamo vidi samo
premise i format.

Usput popravljeno: izbor kampanje je bio `useCookie`, koji svakom pozivaocu daje
svoj ref — pa je promena kampanje u sidebar-u ostavljala dashboard na staroj
(družina i brojači prethodne kampanje). Sad je deljeni `useState`, a kolačić je
samo trajnost.

## Korak 3: DM-only polja na entitetima ✓

Isto pravilo spušteno nivo niže: `dm_` ključevi u `data` entiteta nikad ne stižu
igraču. Filtrira se u jednoj funkciji (`visible_data`) na svakom mestu gde
entitet postaje odgovor — liste, pretraga, oba pravca linkova, detalj, promena
covera i likovi ugrađeni u roster. U rutama se summary sad pravi isključivo kroz
`_summary`, da se ne može zaboraviti.

Dva polja u formi (vidi ih samo DM): **What the party believes** i **Notes**
(markdown sa `[[linkovima]]`). Na stranici entiteta se prikazuju kao kartica
„Behind the curtain", a **Player view** sad izlistava i šta se zadržava
(„Kept back: your notes, what the party believes").

Usput rešena oštra ivica koju sam ranije prijavio: `data` se pri upisu menja u
celini, a igrač nikad ne dobija DM-ov deo — pa bi mu sledeće čuvanje sheeta
obrisalo tvoje beleške. Sad se izmena igrača uklapa ispod DM-ovih ključeva
(`merge_dm_data`), a `dm_` ključ koji igrač pokuša da upiše se odbacuje.

## Korak 4: scene, encounter i clue ✓

Tri nova tipa, svaki košta jedan enum — to je i bila poenta jedne tabele.

- **Scene**: kind (roleplay / investigation / combat / travel / downtime), status,
  purpose („zašto ova scena postoji") i „players learn". Izlazi iz scene su
  **pravi `leads_to` linkovi**, ne lista imena u polju — pa odredište zna šta
  vodi ka njemu, a preimenovanje nosi strelicu sa sobom. `sync_wiki_links` dira
  isključivo `mentions`, pa izmena teksta ne briše flowchart (ima test baš za to).
  Kartica „Where it goes" prikazuje oba pravca i kaže kad scena nema izlaz.
- **Encounter**: kind (combat / social / puzzle / chase / skill challenge),
  difficulty, **objective** („preživeti tri runde" umesto „pobij sve"), trigger,
  reward. Puzzle je encounter tipa puzzle, ne četvrti tip — hintovi idu u
  `dm_notes`.
- **Clue**: points_to (zaključak), found_at, weight (essential / supporting /
  flavour), difficulty. Na listi tragova stoji kartica **„Ways in"** koja grupiše
  po zaključku i pokazuje tri tačkice po redu — **rule of three koji softver
  proverava umesto tebe**, sa upozorenjem kad nešto esencijalno visi o manje od
  tri traga.

Usput: vrednosti strukturiranih polja se više ne kapitalizuju po reči osim kod
polja sa fiksnim opcijama — rečenice su izgledale Kao Naslov Knjige.

Sledeće po dogovoru: run mode.

### Namerno van plana (za sada)

Rules engine i uvoz SRD podataka · character builder · virtuelni sto (fog of war,
tokeni) · glasanja igrača · real-time kolaboracija u pisanju · mobilna aplikacija.
Sve se može dodati kasnije, ništa od toga ne blokira gore navedeno.

### Tehnički dug koji čeka pravi trenutak

- E2E test za cast tok (SSE) — sad je pokriveno ručnom proverom
- Postgres LISTEN/NOTIFY umesto in-memory brokera kad backend dobije više workera
- Slike na S3/R2 pre produkcije (lokalni disk je jednomašinski)
- Neon baza + deploy — kad kažeš da izlazimo iz lokalnog razvoja
