# Migracja UI: Radix UI do shadcn/ui na Base UI

## Status i miejsce w roadmapie

**Faza 8A została wdrożona 2026-07-24.** Migracja pozostaje osobnym podetapem po
[baseline React Doctor](phase-8-react-doctor-baseline.md) i poprawkach z kroku 2, ale przed
migracją aplikacji z Vite do TanStack Start.

Nie laczymy w jednym kroku:

- zmiany prymitywow interakcji i accessibility;
- migracji frameworka oraz routingu;
- przebudowy widokow biznesowych;
- wdrożenia TanStack Query i TanStack Form z Zod. TanStack Table został później
  świadomie porzucony w Fazie 8, kroku 9, jako nieuzasadniony dla obecnych widoków kart,
  a TanStack Form wdrożono w kroku 10 dla wszystkich formularzy zapisujących dane.

## Baseline obecnego frontendu

Baseline jakości wykonano 2026-07-23. React Doctor zgłosił 99 surowych diagnostyk, w tym
35 nieużywanych plików `components/ui`. TypeScript i build przechodzą, a OxLint nie zgłasza
błędów. Szczegółowe wyniki, wersje narzędzi i kolejność triage'u znajdują się w
[baseline Fazy 8](phase-8-react-doctor-baseline.md).

Przed migracją:

- `frontend/src/components/ui` zawiera 48 plikow komponentow w stylu shadcn;
- 31 plikow bezposrednio importuje pakiety `@radix-ui/*`;
- `frontend/package.json` zawiera 26 bezposrednich zaleznosci `@radix-ui/react-*`;
- repo nie ma `frontend/components.json`, wiec obecny zestaw nie jest formalnie skonfigurowany dla CLI shadcn;
- komponenty biznesowe korzystaja glownie z wrapperow `./ui/*`, co daje dobra granice migracji;
- bezposrednio uzywane sa przede wszystkim: `alert`, `alert-dialog`, `badge`, `button`, `card`, `checkbox`, `dialog`, `input`, `label`, `select`, `sonner` i `textarea`.

Po migracji:

- `frontend/components.json` formalnie wskazuje `style: base-nova`, czyli shadcn na Base UI;
- 12 faktycznie używanych wrapperów pochodzi z oficjalnego rejestru shadcn;
- 36 nieosiągalnych plików UI usunięto zamiast migrować;
- nie ma importów ani zależności `@radix-ui/*`;
- usunięto także osierocone `cmdk`, `embla-carousel-react`, `input-otp`,
  `react-day-picker`, `react-hook-form`, `react-resizable-panels`, `recharts` i `vaul`;
- wspólny helper znajduje się wyłącznie w `frontend/src/lib/utils.ts`;
- zależności są przypięte dokładnie: `@base-ui/react@1.6.0`, `shadcn@4.14.0` oraz
  `tw-animate-css@1.4.0`;
- CLI `4.14.0` wybrano świadomie, ponieważ `4.14.1` nie spełniał jeszcze bufora 24 godzin;
- instalację i operacje CLI wykonano przez Socket Firewall.

## Decyzja docelowa

- Warstwa UI pozostaje kodem zrodlowym nalezacym do projektu w `frontend/src/components/ui`.
- Do zarzadzania komponentami uzywamy shadcn/ui z Base UI jako biblioteka prymitywow.
- Konfiguracja shadcn znajduje sie w `frontend/components.json`.
- Zachowujemy obecne tokeny White-Label, Tailwind CSS oraz publiczne API wrapperow tam, gdzie jest to bezpieczne.
- Nie przenosimy importow Base UI do komponentow biznesowych. Szczegoly implementacji pozostaja zamkniete w `components/ui`.
- Zakończona migracja nie dopuszcza współistnienia Radix i Base UI. Powrót zależności,
  importów albo zmiennych CSS Radix blokuje `pnpm check:source`.
- Nie migrujemy automatycznie nieuzywanych komponentow. Najpierw usuwamy je albo odkladamy do momentu rzeczywistego uzycia.

shadcn/ui udostepnia warianty komponentow dla Base UI i zaleca progresywna migracje istniejacych aplikacji. Zrodla: [Base UI jako domyslna baza shadcn](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default), [CLI shadcn](https://ui.shadcn.com/docs/cli), [Base UI](https://base-ui.com/react/overview/about).

## Zrealizowany zakres

### 1. Przygotowanie — wykonane

1. Uruchomic i zapisac baseline: TypeScript 7 typecheck, Oxlint, build, React Doctor oraz podstawowe testy interakcji.
2. Dodac `frontend/components.json` wskazujacy Base UI.
3. Dodac alias `@/*` w TypeScript i konfiguracji bundlera.
4. Ujednolicic helper `cn()` w `frontend/src/lib/utils.ts` bez rownoleglych kopii.
5. Zabezpieczyc i zachowac tokeny z `frontend/src/App.css`; inicjalizacja shadcn nie moze ich bezrefleksyjnie nadpisac.

### 2. Komponenty podstawowe — wykonane

Migrowac i weryfikowac osobno:

1. `button`, `badge`, `card`;
2. `input`, `label`, `textarea`, `alert`;
3. `checkbox`;
4. `dialog` i `alert-dialog`;
5. `select`;
6. `sonner` zachowac albo zaktualizowac niezaleznie, poniewaz nie jest wrapperem Radix.

### 3. Komponenty nieużywane i zależności — wykonane

1. Zbudowac graf importow pozostalych plikow `components/ui`.
2. Usunac komponenty nieuzywane przez aplikacje ani inne zachowane wrappery.
3. Migrowac pozostale komponenty dopiero przed ich faktycznym wykorzystaniem.
4. Usunac dana zaleznosc `@radix-ui/react-*` dopiero po usunieciu wszystkich jej importow.

## Roznice wymagajace recznej kontroli

- Radix `asChild` nie jest mechanicznym odpowiednikiem Base UI; trzeba sprawdzic API `render` i semantyke elementu.
- `Dialog`, `AlertDialog` i `Select` wymagaja kontroli controlled state, `open`, `onOpenChange`, `value` i `onValueChange`.
- Trzeba przetestowac portal, stacking context, scroll lock, focus trap, powrot focusu oraz zamykanie klawiszem Escape.
- Nalezy sprawdzic nawigacje klawiatura, screen reader labels, role ARIA i widoczny focus.
- Migracja nie moze zmienic kontraktow komponentow biznesowych bez jawnego uzasadnienia.

Aktualny kod zawiera co najmniej jedno uzycie `DialogTrigger asChild`, ktore wymaga recznej migracji zamiast globalnej zamiany tekstu.

## Weryfikacja

Po kazdym kroku:

1. `pnpm typecheck`;
2. `pnpm lint`;
3. `pnpm build`;
4. test widoku w przegladarce;
5. test klawiatury, focusu i zachowania portalu;
6. React Doctor po zmianach obejmujacych komponenty React;
7. krótki raport w `frontend/.migration/<component>.md` z różnicami zachowania i listą
   kontroli ręcznej.

Wynik końcowy:

- TypeScript 7: zero błędów;
- OxFmt: przechodzi;
- OxLint: zero błędów, dwa oczekiwane ostrzeżenia o importach CSS;
- React Doctor `0.9.1`: **0 błędów i 0 ostrzeżeń**;
- build Vite: przechodzi, 2254 moduły;
- CSS: `55.50 kB`, gzip `10.37 kB`;
- JS: `670.93 kB`, gzip `210.42 kB`;
- dialog: portal, Escape i powrót fokusu do triggera sprawdzone;
- select: portal, wybór klawiaturą i widoczna etykieta wartości sprawdzone;
- checkbox: dostępna nazwa i kontrolowana zmiana stanu sprawdzone.
- pełne `CI=true pnpm check`: przechodzi, w tym 159 testów Vitest oraz dwa testowe buildy
  White-Label.

Wzrost głównego JS względem wyniku po kroku 2 wynika z przejścia na Base UI. Nie podnosimy
limitu Vite; podział tras i lazy loading pozostają zadaniem dalszej Fazy 8. Błędy konsoli
w samym teście podglądu dotyczyły wyłącznie nieuruchomionych lokalnie usług auth/backend,
nie komponentów UI.

## Kryteria ukończenia Fazy 8A

- Wszystkie faktycznie uzywane wrappery UI korzystaja z wariantow shadcn/Base UI.
- Komponenty biznesowe nadal importuja tylko lokalne wrappery `components/ui`.
- Nie ma importow `@radix-ui/*` w migrowanych komponentach.
- Po zakonczeniu pelnego zakresu nie ma nieuzywanych zaleznosci `@radix-ui/react-*`.
- Typecheck, lint, build i React Doctor przechodza.
- Dialogi, formularze, selecty i alerty przechodza testy klawiatury oraz focusu.
- Wyglad, tokeny White-Label i responsywnosc nie ulegaja przypadkowej zmianie.
- Migracja TanStack Start nie jest czescia tego samego zestawu zmian.

Wszystkie powyższe kryteria zostały spełnione.

Ostateczny kontrakt tokenów, stanów semantycznych i automatycznej ochrony granicy
wrapperów został domknięty w [Fazie 8, kroku 15](phase-8-design-system.md).
