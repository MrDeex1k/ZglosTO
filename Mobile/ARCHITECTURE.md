# Docelowa architektura aplikacji mobilnej

## Zasady

- Expo managed workflow i React Native New Architecture.
- Expo Router odpowiada wyłącznie za nawigację i pliki tras w `app/`.
- Komponenty, domena, API, query, storage i typy znajdują się poza `app/`.
- Projekt od początku używa lokalnych development buildów z `expo-dev-client`;
  Expo Go nie jest elementem wspieranego procesu.
- UI jest natywne. NativeWind może zapewnić mobilny wariant utility-first, ale nie
  przenosimy webowych komponentów Base UI, elementów DOM ani konfiguracji CSS 1:1.
- Wszystkie bezpośrednie zależności są przypięte dokładnie i przechodzą politykę
  kwarantanny/SFW repozytorium.
- Sekrety nie trafiają do `EXPO_PUBLIC_*`.

## Miejsce w monorepo

`Mobile/` jest pakietem workspace. Bootstrap:

1. utrzymuje `Mobile` w `pnpm-workspace.yaml`;
2. korzysta z `package.json`, `app.config.ts`, `tsconfig.json` i Vitest;
3. zachowuje jeden główny `pnpm-lock.yaml`;
4. potwierdza, że Metro używa automatycznej konfiguracji monorepo dla Expo SDK 57,
   bez ręcznych `watchFolders` i `extraNodeModules`;
5. wykonuje buildy lokalnie przez `expo run:ios` i `expo run:android`.

Expo SDK 57 automatycznie obsługuje Metro w pnpm monorepo; ręczna konfiguracja Metro
nie została dodana.

## Planowana struktura

```text
Mobile/
  app/
    _layout.tsx
    index.tsx
    (auth)/
      _layout.tsx
      login.tsx
      register.tsx
    (resident)/
      _layout.tsx
      reports.tsx
      account.tsx
    (service)/
      _layout.tsx
      queue.tsx
      account.tsx
    incidents/
      [id].tsx
    report/
      new.tsx
    settings/
      language.tsx
  src/
    api/
      client.ts
      authenticated-fetch.ts
      errors.ts
      incidents.ts
      uploads.ts
      white-label.ts
    auth/
      auth-client.ts
      auth-storage.ts
      route-access.ts
      session-model.ts
      session-provider.tsx
    components/
      ui/
      incidents/
      forms/
      feedback/
    lib/
      cn.ts
    config/
      env.ts
      runtime-config.ts
    features/
      public-feed/
      report-incident/
      resident-reports/
      service-queue/
      account/
    i18n/
      index.ts
      storage.ts
    navigation/
      role-layout.tsx
      routes.ts
    queries/
      query-client.ts
      query-keys.ts
      persistence.ts
    storage/
      keys.ts
      secure.ts
      preferences.ts
    theme/
      colors.ts
      spacing.ts
      typography.ts
      theme-provider.tsx
    styles/
      global.css
    types/
      media.ts
    utils/
      dates.ts
      links.ts
  assets/
  tests/
    integration/
    fixtures/
  e2e/
  app.config.ts
  eas.json
  metro.config.js
  nativewind-env.d.ts
  package.json
  tsconfig.json
```

To jest struktura docelowa, nie zobowiązanie do tworzenia pustych plików. Katalog
`app/` ma pozostać cienki: deklaruje ekran, opcje stosu i składa feature.

## Nawigacja

### Root

Root Stack:

- publiczny start `/`;
- grupy auth i role-aware;
- publiczne szczegóły `/incidents/[id]` dostępne tylko anonimowo i mieszkańcowi;
- formularz `/report/new` jako ekran modalny lub pełny ekran zależnie od platformy;
- ustawienia języka.

### Role-aware shell

- anonimowy: Start, logowanie/rejestracja dostępne z header/account;
- mieszkaniec: Start, Moje zgłoszenia, Konto;
- służby: Kolejka i jej szczegóły; publiczny start jest niedostępny;
- admin: wyłącznie komunikat o wymaganym komputerze i wylogowanie; bez linku WEB.

W wersji 1.0 role są rozłączne. Służba ani administrator nie dziedziczą dostępu
mieszkańca. Szczegóły decyzji zawiera
[PHASE_6_0_ROLE_BOUNDARIES.md](PHASE_6_0_ROLE_BOUNDARIES.md).

Nawigacja nie ufa lokalnej roli jako mechanizmowi bezpieczeństwa. Jest wygodą UI;
każdy endpoint nadal egzekwuje role.

### Dialogi webowe

- szczegóły incydentu → push screen;
- formularz zgłoszenia → modalny route z natywnym nagłówkiem;
- zarządzanie incydentem służby/admina → detail screen z sekcją akcji;
- proste potwierdzenia → natywny alert;
- wybór statusu/usługi → natywny picker lub sheet.

## Warstwy

### Kontrakty

Mobile importuje runtime parsery bezpośrednio z `@zglosto/contracts`. Nie kopiuje
DTO. Gdy frontend ma webowy model prezentacyjny, mapowanie należy przenieść do
platformowo neutralnej funkcji albo odtworzyć w `Mobile/src/api`.

### Dane serwerowe

TanStack Query:

- publiczny feed z umiarkowanym `staleTime`, montowany wyłącznie dla sesji
  anonimowej albo mieszkańca;
- historia mieszkańca jako `['private', 'resident', userId, 'incidents', origin]`;
- prywatne query keys rozdzielone rolą i user ID;
- invalidacja po mutacjach;
- synchronizacja online/offline przez NetInfo;
- usuwanie prywatnego cache przy wylogowaniu;
- brak trwałego cache prywatnych danych do czasu akceptacji polityki retencji.

`expo/fetch` jest preferowanym transportem. Każda odpowiedź jest sprawdzana przez
status HTTP i parser kontraktu.

Historia mieszkańca używa `FlatList`, pull-to-refresh i stanów loading/empty/error.
Nie jest utrwalana w AsyncStorage; cold restart pobiera dane ponownie po odtworzeniu
sesji z SecureStore.

### Auth

Better Auth + `@better-auth/expo`:

- SecureStore dla cookie/cache sesji;
- absolutny publiczny HTTPS `baseURL`;
- `authClient.getCookie()` do nagłówka `Cookie` chronionych requestów domenowych;
- `credentials: omit` w requestach z jawnym cookie;
- centralna obsługa `401`, `403` i wygasłej sesji;
- wylogowanie czyści sesję, prywatne query i dane tymczasowe.

### White-Label

Start aplikacji:

1. pobierz `/api/config/public` z `If-None-Match`, jeśli istnieje cache;
2. zweryfikuj odpowiedź parserem `@zglosto/contracts`;
3. zbuduj theme i katalog usług;
4. w razie braku sieci użyj ostatniej poprawnej publicznej konfiguracji;
5. jeśli nie istnieje żadna poprawna konfiguracja, pokaż blokujący ekran
   konfiguracyjny z retry.

Root-relative `logoPath` musi zostać rozwiązany względem publicznego originu.

### UI i design system

- preferowaną warstwą stylowania jest NativeWind, ponieważ zachowuje znany zespołowi
  model utility-first i dobrze pasuje do lokalnych komponentów UI;
- dla produkcyjnego bootstrapu punktem wyjścia jest stabilna linia NativeWind v4 z
  obsługiwaną przez nią wersją Tailwind CSS; NativeWind v5 i Tailwind CSS v4 można
  wybrać dopiero wtedy, gdy v5 utraci oficjalny status pre-release i przejdzie
  checkpoint na aktualnym Expo SDK;
- klas, konfiguracji i arkuszy webowego Tailwind nie współdzielimy automatycznie:
  współdzielone pozostają nazwy tokenów i semantyka, a implementacje web/mobile są
  platformowe;
- React Native Reusables jest preferowanym źródłem wybranych komponentów startowych
  w stylu shadcn, a nie zależnością, która ma przejąć cały design system;
- wybrane komponenty React Native Reusables są kopiowane do `src/components/ui`,
  stają się kodem projektu i mogą być zmieniane pod White-Label, dostępność i API
  ZgłosTO;
- zaczynamy od małego zestawu: `button`, `text`, `card`, `badge`, `input`, `label`,
  `checkbox`, `select`/picker, `alert` i `separator`; modalne zachowania i nawigację
  nadal zapewniają przede wszystkim Expo Router oraz natywne API;
- nie instalujemy całego rejestru ani wszystkich RN Primitives. Każdy dodany komponent
  musi mieć realnego konsumenta, test VoiceOver/TalkBack i kontrolę na obu platformach;
- tokeny kolorów z White-Label są tłumaczone na obiekt theme;
- semantyczne kolory statusów pozostają wspólne znaczeniowo;
- `ScrollView`/`FlatList` używa automatycznych insetów;
- długie listy używają `FlatList`; FlashList dopiero po pomiarze;
- obrazy renderuje `expo-image`;
- safe area przez `react-native-safe-area-context` i nagłówki Expo Router;
- layout przez flex i `useWindowDimensions`, bez stałych wymiarów ekranu;
- ważne dane w `Text` są selectable;
- animacje są subtelne, respektują reduce motion i nie blokują JS thread.

NativeWind jest zamiennikiem sposobu zapisu stylów, nie natywnych zachowań. Komponenty
nadal używają `View`, `Text`, `Pressable`, `TextInput`, `FlatList` i `expo-image`.
Dynamiczne wartości White-Label, wartości zależne od pomiaru oraz style komponentów
zewnętrznych mogą nadal korzystać z `style` i `useWindowDimensions`.

React Native Reusables opisuje się jako sposób budowania własnej biblioteki, nie gotową
bibliotekę runtime. To odpowiada obecnej granicy webowego shadcn: kod źródłowy należy do
projektu, a zależności od RN Primitives pozostają zamknięte w `src/components/ui`.

Źródła decyzji:

- [NativeWind v4 — instalacja](https://www.nativewind.dev/docs/getting-started/installation);
- [NativeWind v5 — status pre-release](https://www.nativewind.dev/v5);
- [React Native Reusables — wprowadzenie](https://reactnativereusables.com/docs);
- [React Native Reusables — instalacja](https://reactnativereusables.com/docs/installation/manual).

### Formularze

Można zachować TanStack Form i Zod, jeśli checkpoint potwierdzi ergonomię React
Native. Schematy oparte o przeglądarkowy `File` nie są współdzielone bezpośrednio.
Mobile definiuje neutralny `SelectedMedia` z `uri`, `mimeType`, `sizeBytes`,
`fileName` i ewentualnym `checksumSha256`.

Formularz zgłoszenia:

- emergency disclaimer;
- usługa;
- adres;
- opis;
- e-mail (zablokowany do e-maila sesji dla zalogowanego mieszkańca);
- opcjonalne zdjęcie z aparatu lub biblioteki;
- stan uploadu i możliwość ponowienia.

### Obserwowalność

Przed wydaniem wymagane są:

- crash reporting z oddzieleniem środowisk;
- correlation ID z odpowiedzi/requestu, bez PII;
- metryki zimnego startu i kluczowych interakcji;
- wersja aplikacji, runtime version i config version w diagnostyce;
- procedura wycofania binary i OTA;
- brak adresów, opisów, e-maili i zdjęć w telemetryce.

## Buildy lokalne i przyszłe wydania

- obecnie development buildy powstają lokalnie przez `expo run:ios` i
  `expo run:android`;
- instalacja na symulatorach nie wymaga płatnych kont Apple ani Google;
- fizyczny iPhone korzysta z lokalnego podpisywania Xcode i ograniczeń bezpłatnego
  Apple Account do czasu zakupu członkostwa;
- preview, production, sklepy i EAS Update są odroczone do osobnej decyzji wydaniowej;
- API URL i publiczne identyfikatory pochodzą obecnie z lokalnego `Mobile/.env`;
- sekrety serwerowe nigdy nie są osadzane w aplikacji;
- przyszły OTA musi mieć runtime version, rollout, monitoring i procedurę
  rollback/republish.
