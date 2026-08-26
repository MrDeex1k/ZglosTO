# Faza 1: zakres kontraktów i migracji TypeScript

## Status

**Faza 1 zakończona 2026-07-17.** Kod aplikacyjny i testowy jest w TypeScript, wspólne
kontrakty mają parsery runtime oraz testy, wszystkie projekty dziedziczą ścisłe ustawienia z
głównego `tsconfig.base.json`, a frontend używa Tailwind CSS-first bez konfiguracyjnego
JavaScript. Pełna bramka `pnpm quality:phase1` łączy kontrolę źródeł, Oxfmt, Oxlint,
typecheck, testy jednostkowe i kontraktowe, build oraz izolowane testy integracyjne Compose.

## Cel

Po Fazie 1 kod aplikacyjny JavaScript/TypeScript ma mieć jedno źródło kontraktów i pełny,
ścisły typecheck. Migracje frameworków pozostają w późniejszych fazach, ale brak zmiany
frameworka nie jest powodem do utrzymywania kodu aplikacyjnego w JavaScript.

Faza 1 ma zapewnić:

- jeden pakiet `@zglosto/contracts` dla stabilnych wartości i typów przekraczających granice
  usług;
- TypeScript dla całego kodu aplikacyjnego Node i wszystkich testów JavaScript;
- brak jawnego i niejawnego `any` w kodzie pierwszej strony;
- brak `undefined` w kontraktach API, modelach domenowych i trwałym stanie aplikacji;
- walidację oraz zawężanie danych pochodzących z HTTP, ENV, bazy, plików i bibliotek;
- możliwość późniejszej wymiany Express na Hono/NestJS bez ponownego zgadywania payloadów.

## Obowiązujące zasady typowania

### TypeScript zamiast JavaScript

- Nowy kod aplikacyjny, testowy i współdzielone narzędzia powstają wyłącznie w TypeScript.
- Istniejący backend Express jest migrowany do TypeScript w Fazie 1. Faza 6 zastąpi już
  typowany backend Express przez NestJS.
- Testy Node oraz testy integracyjne `.js`/`.mjs` są migrowane do `.ts` i uruchamiane przez
  wspólny mechanizm TypeScript.
- Plik JavaScript może pozostać tylko wtedy, gdy zewnętrzne narzędzie nie obsługuje
  TypeScript. Taki wyjątek musi być deklaratywny, nie może zawierać logiki domenowej i musi
  być wpisany w tym dokumencie z uzasadnieniem.
- Wygenerowany JavaScript w `dist/` nie jest kodem źródłowym i nie podlega tej zasadzie.

### Zakaz `any`

- Jawne `any`, rzutowania `as any` i niejawne `any` są niedozwolone w kodzie pierwszej
  strony.
- Dane na niezaufanej granicy mają typ `unknown`, a następnie są walidowane i zawężane przed
  wejściem do logiki domenowej.
- Typy zewnętrznych bibliotek nie mogą być obchodzone przez `any`. Brakujący typ uzupełniamy
  lokalnym adapterem, deklaracją albo walidowanym typem pośrednim.
- Błędy w `catch` pozostają `unknown` i są rozpoznawane przez bezpieczną funkcję pomocniczą.

### Brak `undefined` w kontraktach i domenie

- Wszystkie właściwości kontraktów są wymagane. Brak wartości jest reprezentowany jawnie
  przez `null`.
- Pole nie ma typu opcjonalnego `property?: T` ani unii `T | undefined` w
  `@zglosto/contracts`.
- Jeżeli brak wartości zmienia znaczenie całego wyniku, stosujemy unię dyskryminowaną zamiast
  zestawu opcjonalnych pól.
- Adapter HTTP normalizuje pominięte pole starszego payloadu do `null`. Wewnętrzna logika nie
  rozróżnia pominięcia właściwości od jawnego `null`.
- Tablice są puste zamiast nieobecnych, a kolekcje klucz-wartość mają jawny typ i pustą wartość
  początkową.
- Wyjątkiem są sygnatury zewnętrznych API platformy lub bibliotek. Wartość jest normalizowana
  w adapterze i nie przechodzi dalej do domeny.

Przykład docelowego kontraktu:

```ts
export interface CreateIncidentRequest {
  description: string;
  reporterEmail: string;
  address: string;
  requestedServiceKey: string | null;
  imageBase64: string | null;
}
```

Przykład wyniku, w którym wariant określa dostępne dane:

```ts
export type ClassificationResult =
  | {
      kind: 'classified';
      classification: 'municipal' | 'emergency';
      serviceKey: string;
      confidence: number | null;
    }
  | {
      kind: 'fallback';
      classification: 'unknown';
      serviceKey: string;
      reason: 'timeout' | 'disabled' | 'unavailable' | 'invalid_response';
    };
```

## Warstwy kontraktów

`@zglosto/contracts` będzie rozdzielony według odpowiedzialności, a główny `index.ts` będzie
jedynie kontrolowanym publicznym eksportem.

| Moduł         | Odpowiedzialność                 | Przykładowa zawartość                                                |
| ------------- | -------------------------------- | -------------------------------------------------------------------- |
| `common`      | Stabilne prymitywy współdzielone | identyfikatory, ISO date-time, stronicowanie, kontrakt błędu         |
| `auth`        | Tożsamość i transport sesji      | role, użytkownik sesji, `serviceKey`, web cookie, Expo cookie header |
| `incidents`   | Główna domena zgłoszeń           | statusy, DTO tworzenia i odczytu, lokalizacja, autor zgłoszenia      |
| `services`    | Operacje służb miejskich         | przypisanie, zmiana statusu, statystyki służby                       |
| `admin`       | Operacje administracyjne         | lista/statystyki, zmiana roli i przypisania użytkownika              |
| `images`      | Zdjęcia przejściowe i docelowe   | base64 na wejściu, metadane i neutralna referencja Object Storage    |
| `llm`         | Stabilna granica klasyfikacji    | request, wynik modelu, fallback i techniczna przyczyna               |
| `white-label` | Kontrakt produktu                | miasto, locale, branding, mapa, katalog usług, routing               |

Pakiet kontraktów:

- nie importuje Express, Hono, NestJS, React, Better Auth, klienta PostgreSQL ani SDK storage;
- nie zawiera komponentów UI, zapytań SQL ani logiki transportowej;
- używa stringów ISO 8601 na granicach zamiast obiektów `Date`;
- zachowuje osobne nazwy dla bieżących DTO HTTP i docelowego modelu domenowego;
- eksportuje wartości runtime dla zamkniętych katalogów, a typy wyprowadza z tych wartości;
- w Fazie 2 otrzyma strict schemat Zod konfiguracji White-Label i typ wyprowadzony ze
  schematu.

## Bieżący transport a model docelowy

Obecne API Express używa pól polskich, między innymi `opis_zgloszenia`,
`mail_zglaszajacego`, `typ_sluzby` i `status_incydentu`. Nie zmieniamy ich niejawnie podczas
samego wprowadzania typów.

Wspólny pakiet utrzymuje dwie jawne warstwy:

1. `Current*Dto` opisuje dokładny, obecny payload HTTP chroniony testami Fazy 0.
2. Typy domenowe używają stabilnych nazw angielskich, `serviceKey` i jawnego `null`.

Adapter na granicy API odpowiada za mapowanie między warstwami. Usunięcie `Current*Dto`
nastąpi dopiero przy kontrolowanej zmianie kontraktu HTTP albo po migracji wszystkich
konsumentów.

## Inwentaryzacja migracji JavaScript

### Kod aplikacyjny backendu — migracja wdrożona 2026-07-17

- `backend/config/env.ts`;
- `backend/database.ts`;
- `backend/index.ts`;
- `backend/lib/database-records.ts`;
- `backend/lib/image-data-url.ts`;
- `backend/lib/llm-classification.ts`;
- `backend/lib/reporter-identity.ts`;
- `backend/lib/request-parsers.ts`;
- `backend/middleware/auth.ts`;
- `backend/routes/admin.ts`;
- `backend/routes/mieszkaniec.ts`;
- `backend/routes/sluzby.ts`.

Wszystkie odpowiadające im testy przeszły na `.test.ts`. Backend ma ścisły `tsconfig`, osobne
`typecheck`, `build` i `start`, a obraz produkcyjny uruchamia wyłącznie skompilowany
`dist/index.js`. Dane z HTTP, authorization i PostgreSQL są odbierane jako `unknown` oraz
walidowane przed wejściem do logiki i odpowiedzi API.

### Testy integracyjne — migracja wdrożona 2026-07-17

- `tests/integration/llm-stub.ts`;
- `tests/integration/phase0.integration.ts`.

Runner używa natywnej obsługi TypeScript w Node 26 i podlega osobnemu ścisłemu
`tests/integration/tsconfig.json`. Migracja zachowała izolację i cały zakres scenariuszy
zestawu Fazy 0, co potwierdził pełny przebieg Compose.

### Konfiguracja frontendu — CSS-first wdrożone 2026-07-17

Frontend korzysta z Tailwind CSS 4 przez dedykowany plugin `@tailwindcss/vite`. Usunięto
`postcss`, `autoprefixer`, `@tailwindcss/postcss`, `postcss.config.js` oraz
`tailwind.config.js`. Import frameworka, tokeny motywu, wariant dark, kontener i animacje
znajdują się bezpośrednio w `frontend/src/App.css` przy użyciu `@import`, `@theme`,
`@custom-variant` i `@utility`. Frontend nie ma już konfiguracyjnego wyjątku JavaScript.
`postcss` może nadal występować w `pnpm-lock.yaml` wyłącznie jako wewnętrzna zależność Vite;
nie jest bezpośrednią zależnością ani elementem pipeline'u CSS projektu.

## Kontrola długu typowania — wdrożona

Jawne użycia `any` zostały usunięte z kodu pierwszej strony, w tym z adaptera Recharts.
Kontrakty, serwisy i testy nie używają jawnego `undefined`; brak wartości w domenie jest
normalizowany do `null`. Opcjonalność odziedziczona z React DOM lub API bibliotek pozostaje
wyłącznie na granicy adaptera i nie przechodzi do kontraktów ani trwałego stanu.

Skrypt `scripts/check-typescript-source.sh` blokuje źródłowe pliki JavaScript, jawne `any` w
TypeScript oraz jawne `undefined` w kontraktach, serwisach i testach. Jest uruchamiany przez
`pnpm check` i końcową bramkę Fazy 1.

## Docelowe ustawienia kompilatora

Wspólna konfiguracja bazowa w Fazie 1 włącza co najmniej:

- `strict`;
- `noImplicitAny`;
- `strictNullChecks`;
- `noUncheckedIndexedAccess`;
- `exactOptionalPropertyTypes`;
- `useUnknownInCatchVariables`;
- `noFallthroughCasesInSwitch`;
- `noUncheckedSideEffectImports`.

Konfiguracje Node i browser mogą różnić się `module`, `moduleResolution`, `lib` i sposobem
emitowania. Ujednolicenie nie oznacza wymuszenia ustawień bundlera na serwisach Node.

## Zrealizowana kolejność

1. **Wdrożone:** rozdzielono i uzupełniono `@zglosto/contracts` zgodnie z powyższą mapą;
   pakiet eksportuje też parsery runtime walidujące `unknown` na granicy HTTP.
2. **Wdrożone:** podłączono pakiet do frontendu i authorization, usunięto lokalne duplikaty
   ról, statusów, DTO incydentów i kontraktu LLM oraz wyeliminowano `any`/`undefined` z
   dotkniętych modułów.
3. **Wdrożone:** zmigrowano backend Express i jego testy z JavaScript do TypeScript,
   przełączono test runner z `node:test` na Vitest, włączono ścisłą kompilację, parsery
   granic HTTP/bazy/auth oraz produkcyjny build `dist`. Osobny `tsconfig.build.json` wyklucza
   testy i konfigurację Vitesta z artefaktu produkcyjnego, zachowując je w pełnym typechecku.
4. **Wdrożone:** rozstrzygnięto konfigurację frontendu przez przejście na Tailwind CSS-first
   bez PostCSS i plików JavaScript oraz zmigrowano pełny zestaw integracyjny z MJS do
   TypeScript.
5. **Wdrożone:** dodano wspólny `tsconfig.base.json`, włączono pełny tryb ścisły we wszystkich
   projektach i testach oraz poprawiono wszystkie wykryte błędy kompilatora.
6. **Wdrożone:** dodano osiem testów kontraktowych, wykonano baseline Oxfmt na całym
   repozytorium i uruchomiono pełną bramkę `pnpm quality:phase1`.

## Definicja ukończenia Fazy 1

Faza jest ukończona, ponieważ:

- zakres i właściciele kontraktów są jednoznacznie opisani;
- przyjęto zasady TypeScript, `any` i nullowalności;
- zinwentaryzowano cały źródłowy JavaScript poza zależnościami i artefaktami;
- zinwentaryzowano istniejące użycia `any` oraz źródła `undefined` w kodzie pierwszej strony;
- wskazano granicę między bieżącym DTO HTTP a modelem docelowym;
- obecny zalążek `@zglosto/contracts` został dostosowany do zasady jawnego `null`.
- nie ma źródłowych plików JavaScript/MJS w aplikacji i testach;
- wszystkie konfiguracje TypeScript dziedziczą wspólne rygorystyczne zasady;
- testy kontraktowe i integracyjne walidują dane jako `unknown` przed użyciem;
- `pnpm check` oraz pełny izolowany przebieg integracyjny kończą się powodzeniem.
