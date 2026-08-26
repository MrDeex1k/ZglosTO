# Checkpoint Fazy 7 — gotowość kodu Mobile

Data: **2026-08-25**.

## Decyzja

**SOURCE READY / CLIENT-BUILT / NOT STORE-PUBLISHED**.

Kod Mobile, syntetyczne demo, konfiguracja White-Label, materiały, lokalna regresja
Android/iOS oraz dokument przekazania są gotowe. Nie utworzono tagu ani GitHub Release.
Nie powstaje centralny release binarny Mobile: każdy klient buduje własną aplikację dla
własnej instancji. Wydanie źródłowe będzie wspólne dla całego produktu dopiero po
przeglądzie codebase'u i uporządkowaniu historii Git.

## Zamknięty zakres

- 7.0–7.4 — kontrakt repozytorium, governance, audyt, White-Label, Quick Start i portfolio;
- 7.6 — wersjonowana regresja Maestro uruchamiana przez agent-device, 3/3 PASS na obu
  aktywnych platformach;
- 7.8 — kompletny dokument przekazania klientowi;
- 7.9 — lokalny checkpoint kodu i audyt gotowości repozytorium.

Świadomie uznano za niewymagane w modelu Client-Built:

- 7.5 — centralne GitHub Actions i automatyczne buildy Mobile;
- 7.7 — wspólny binarny artefakt demonstracyjny;
- tag, changelog produktu i GitHub Release — do wspólnego procesu wydania monorepo.

## Dowody checkpointu

- Android Pixel 9: 3/3 scenariusze PASS w 148,9 s;
- iPhone 17 Pro / iOS 26.5: 3/3 scenariusze PASS w 235,9 s;
- Mobile lint i TypeScript — PASS;
- Vitest — 30 plików, 132/132 PASS;
- Expo Doctor — 21/21 PASS;
- public repository scan — 983 pliki, PASS;
- dwa syntetyczne warianty White-Label — PASS;
- Android development build — PASS;
- iOS development build — PASS.

Audyt nie wykrył sekretów, niedozwolonych ścieżek ani naruszenia wspólnego governance.
Screenshoty i fixture'y używają danych syntetycznych; załączone zdjęcie autobusu jest
zanonimizowane i opisane w galerii.

## Interpretacja Quick Start

Bieżąca praca nie jest jeszcze zatwierdzonym commitem, więc dosłowny test `git clone`
tej samej rewizji byłby pozorny — czysty clone nie zawierałby niezatwierdzonych plików.
Checkpoint sprawdza aktualny pakiet źródłowy, lockfile, wymagania, Compose, seed, cleanup,
buildy natywne i oba emulatory. Dosłowny clone po uporządkowaniu historii Git jest bramką
wspólnego release'u produktu, a nie osobnego release'u Mobile.

Dodatkowo utworzono izolowaną kopię źródeł bez `.git`, `node_modules`, natywnych buildów,
`.state` i artefaktów. Kopia przeszła `pnpm install --offline --frozen-lockfile`,
`mobile:demo:check`, Mobile lint, automatyczny build `@zglosto/contracts` i
`@zglosto/i18n`, TypeScript oraz 132/132 testy. Próba ujawniła i usunęła wcześniejsze
założenie, że pakiety współdzielone są już zbudowane po instalacji.

## Co oznacza NOT STORE-PUBLISHED

Repozytorium nie publikuje wspólnego produktu w App Store ani Google Play. Produkcyjny
hosting, domena, signing, privacy, monitoring, testy urządzeń i ewentualny rollout sklepowy
są odpowiedzialnością klienta wdrażającego własną instancję. Szczegóły opisuje
[CLIENT_HANDOFF.md](CLIENT_HANDOFF.md).

## Następny proces

Następny krok nie jest Fazą 8 Mobile. Najpierw należy przeprowadzić wspólny audyt całego
codebase'u, uporządkować historię Git, zatwierdzić jeden spójny commit/release candidate i
dopiero wtedy utworzyć źródłowy release produktu. Centralne buildy Mobile nie są wymagane.
