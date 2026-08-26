# Faza 2: zaakceptowane decyzje White-Label

## Status

Dokument zapisuje zaakceptowany kontrakt wykonawczy Fazy 2. Plan prac znajduje sie w [release.md](release.md), status decyzji w [rejestrze ADR](architecture-decisions.md), a ogolny kierunek w [architekturze docelowej](target-white-label-architecture.md).

## Model produktu i wdrozenia

- Jeden deployment obsluguje dokladnie jedno miasto.
- Wspolny kod moze byc wdrazany wielokrotnie z innymi konfiguracjami miast.
- Na obecnym etapie nie wprowadzamy wielodzierzawnosci runtime ani `tenant_id` w kazdej tabeli.
- Wspolny kontrakt eksportuje jawny model `single-city`. Strict schema przyjmuje jeden obiekt
  `city`, a testy odrzucaja tablice konfiguracji, `cities` oraz pola tenantowe.
- Bramka `check:source` kontroluje kod runtime, SQL i manifesty, aby przypadkowe dodanie
  tenantow albo kolekcji konfiguracji miast wymagalo najpierw jawnej zmiany ADR i planu.
- Konfiguracja nie moze byc zmieniana przez panel admina.
- Zmiana konfiguracji jest wersjonowana i aktywowana przez restart/rollout.
- Nie implementujemy hot reloadu konfiguracji.
- `build-images.sh [tag] [config]` waliduje jeden YAML i osadza go w obrazach frontendu,
  backendu oraz authorization. Bez podanego tagu uzywa `configVersion`; `latest` jest tylko
  lokalnym trybem deweloperskim i jest odrzucany przez `deploy.sh`.
- Deployment przypina jeden tag wszystkich obrazow, umieszcza `city-key`, `config-version`,
  checksum i release tag w adnotacjach oraz czeka na rollout warstw zależnych od configu.
- Po rolloutcie checksum z readiness frontendu, backendu i authorization musi byc identyczny
  z checksumem wdrazanego YAML-a; rozbieznosc konczy wdrozenie bledem.
- Compose przyjmuje ten sam plik przez `WHITE_LABEL_CONFIG_FILE`; dla sciezki wzglednej
  wartosc musi zaczynac sie od `./`, aby Docker Compose potraktowal ja jako bind mount.

## Format i walidacja

- Zrodlem prawdy produktu jest
  [`config/white-label/zglosto.yaml`](../config/white-label/zglosto.yaml), wskazany przez
  `WHITE_LABEL_CONFIG`.
- Config zawiera `schemaVersion` i `configVersion`.
- Pakiet `@zglosto/white-label-config` rozdziela Node-only odczyt pliku od uniwersalnego
  kontraktu. Obsluguje sciezki wzgledne i bezwzgledne, zwraca checksum SHA-256 i nie ujawnia
  zawartosci YAML w bledach.
- Loader procesu zachowuje pierwsza poprawna konfiguracje w pamieci. Proba wskazania drugiego
  pliku w tym samym procesie konczy sie bledem; nie ma hot reloadu.
- Strict schema Zod zostal wdrozony we wspolnym pakiecie; typ TypeScript jest wyprowadzany
  ze schematu, a recznie utrzymywane interfejsy nie sa drugim zrodlem prawdy.
- Nieznane pola oraz bledne wartosci powoduja blad walidacji.
- Walidacja obejmuje relacje miedzy locale, unikalnosc katalogu uslug, aktywna usluge
  awaryjna oraz spojnosc feature flagi mapy z jej konfiguracja.
- Frontendowa warstwa serwerowa, backend i authorization waliduja config przy starcie.
- Bledna konfiguracja blokuje readiness; produkcja nie uruchamia sie z cichym fallbackiem.
- YAML nie zawiera sekretow. Strict kontrakt odrzuca nazwy pol przeznaczone na sekrety,
  rozpoznawalny material kluczy/tokenow, URL-e z poswiadczeniami i interpolacje `${...}` bez
  logowania znalezionej wartosci. Sekrety i ustawienia providerow pozostaja w ENV/K8s Secret,
  a zestaw `pnpm check` laduje kazdy wersjonowany `config/white-label/*.yaml`.
- Konfiguracje `test-gdansk.yaml` i `test-wroclaw.yaml` celowo roznia sie nazwa miasta,
  brandingiem, locale domyslnym, feature flags, kluczami uslug i fallbackiem. Ten sam zestaw
  testow sprawdza loader, publiczna projekcje API oraz build frontendu dla obu plikow.

## Miasto, jezyki i czas

- `city.key` jest stabilnym identyfikatorem technicznym i nie zmienia sie po uruchomieniu produkcyjnym.
- Domyslny locale: `pl-PL`.
- Wspierane locale: `pl-PL` oraz `en`.
- Deployment uzywa jednej lokalnej strefy czasowej: `Europe/Warsaw`.
- `@zglosto/contracts` jest zrodlem prawdy dla `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`,
  `DEPLOYMENT_TIMEZONE` i schematu tekstu wymagajacego obu wersji jezykowych.
- `@zglosto/i18n` uzywa `i18next` jako niezaleznego od Reacta silnika, a frontend dodaje
  adapter `react-i18next`. Katalog polski jest typowanym zrodlem kluczy, a katalog angielski
  musi miec dokladnie ten sam ksztalt.
- Wybor jezyka respektuje kolejno: jawny wybor zapisany w przegladarce, jezyki przegladarki,
  a nastepnie `pl-PL`. Warianty `pl-*` sa normalizowane do `pl-PL`, a `en-*` do `en`.
- Zmiana jezyka dziala w kliencie bez zmiany kontraktow API i bez kodowania locale w URL.
- Daty i liczby sa formatowane przez natywne `Intl`; nie utrzymujemy recznych nazw miesiecy.
  Instancja serwerowa i18n jest tworzona osobno dla zadania, aby przyszly SSR nie wspoldzielil
  jezyka pomiedzy uzytkownikami.
- Teksty ogolne aplikacji naleza do warstwy i18n i nie sa wartosciami domenowymi API.
- Config przechowuje teksty specyficzne dla miasta: nazwe, kontakt, stopke, informacje prawne i lokalne komunikaty.
- API i baza zachowuja stabilne kody oraz czas w UTC; tlumaczenie kodow i prezentacja w
  `Europe/Warsaw` odbywaja sie dopiero na granicy UI.
- Pola lokalizowane sa obiektami wymagajacymi obu kluczy: `pl-PL` i `en`. Dotyczy to nazwy
  miasta, opisu emblematu, adresu, godzin kontaktu, tytulu i opisu strony, stopki oraz
  komunikatu prawnego.

## Branding i zasoby

- Config przechowuje sciezki/URL-e zasobow, nie dane base64.
- Logo moze byc plikiem statycznym, plikiem montowanym albo pozniej zasobem RustFS bez zmiany kontraktu `logoPath`.
- Branding uzywa kontrolowanych tokenow kolorow zamiast dowolnego CSS.
- Tokeny `primary`, `secondary` i `accent` sa walidowanymi kolorami `#RRGGBB`. Frontend
  mapuje je na semantyczne zmienne CSS `--brand-*`; config nie przyjmuje klas ani CSS.
- Ikony uslug sa wskazywane przez walidowany `iconKey`, nie dowolny HTML/SVG.
- Poczatkowy zamkniety katalog `iconKey` obejmuje: `bus`, `circle_help`, `greenery`,
  `lighting`, `road`, `safety`, `trash`, `utilities` oraz `water`.
- `emblemAlt` jest wymagany; kontrast motywu podlega testom dostepnosci.
- Root-relative logo i favicon musza odpowiadac plikom w publicznym katalogu artefaktu;
  test domyslnej konfiguracji sprawdza ich obecnosc.

## Publiczny kontakt i tresci lokalne

- `contact` przechowuje publiczny e-mail, opcjonalny telefon i URL, lokalizowany adres oraz
  opcjonalne godziny obslugi. Pola nie sa przeznaczone na dane wewnetrzne ani sekrety.
- `localContent` przechowuje lokalizowany tytul i opis dokumentu, stopke oraz komunikat
  prawny. Ogolne etykiety interfejsu nadal pozostaja w `@zglosto/i18n`.
- Obecny TanStack Start w trybie SPA wczytuje i waliduje YAML podczas buildu, filtruje
  go do kontraktu publicznego, po czym osadza konfigurację w bundle. Nie powstaje druga
  ręcznie utrzymywana kopia danych miasta.

## Katalog uslug

- `serviceKey` jest trwalym identyfikatorem API i bazy, zgodnym z `^[a-z][a-z0-9_]{1,63}$`.
- Klucza nie zmieniamy i nie wykorzystujemy ponownie po wycofaniu uslugi.
- YAML definiuje katalog produktu, kolejnosc i prezentacje uslug.
- `label`, `shortLabel` i opcjonalny `description` wymagaja wariantow `pl-PL` i `en`.
- Kolor uslugi jest opcjonalnym kontrolowanym `#RRGGBB`; UI nie utrzymuje map klas CSS
  przypisanych do nazw sluzb.
- PostgreSQL materializuje katalog w tabeli `service_types` i zapewnia integralnosc przez klucze obce.
- Migracje `004-service-types-catalog.sql` wykonano jako expand-migrate-contract z jawna,
  jednorazowa mapa stary label -> nowy `serviceKey`. `typ_sluzby_enum` oraz przejsciowe
  `legacyDatabaseValue` nie sa juz czescia kontraktu produktu ani runtime aplikacji.
- `enabled: false` blokuje nowe zgloszenia i przypisania, ale nie usuwa danych historycznych.
- Synchronizacja YAML wykonuje upsert obecnych kluczy, a klucze nieobecne w nowej wersji
  oznacza w PostgreSQL jako `enabled = false`; nigdy nie usuwa ich automatycznie.
- Triggery `incydenty_require_active_service` i `uzytkownicy_require_active_service`
  stanowia ochrone ostatniej linii dla nowych lub zmienionych przypisan. Aktualizacja
  statusu, zdjecia lub odczyt rekordu historycznego nie uruchamia tej blokady.
- Zalecanym sposobem wycofania uslugi jest pozostawienie jej w YAML z `enabled: false`, aby
  frontend nadal dysponowal lokalizowanymi etykietami historii. Pominiecie wpisu nie usuwa
  danych, ale UI moze pokazac stabilny klucz zamiast dawnej etykiety.
- Fizyczne usuniecie `service_types` posiadajacego referencje blokuje klucz obcy. Ten sam
  stabilny klucz mozna ponownie aktywowac, ale nie wolno nadac mu innego znaczenia.
- Kolejnosc UI okresla `sortOrder`.
- Zachowanie awaryjne wskazuje `routing.fallbackServiceKey`; kod nie zaklada na stale klucza `other`.
- Serwis modelu i przyszly model runner nie wybieraja miejskiej uslugi fallback. Dla
  `classification: unknown` zwracaja `serviceKey: null`, a backend podstawia jedyny
  skonfigurowany `routing.fallbackServiceKey` po walidacji calego YAML-a.
- Uzytkownik z rola `sluzby` ma jeden `serviceKey` na obecnym etapie. Inne role maja `serviceKey = null`.
- Sesja i API używają pola `serviceKey`; fizyczna kolumna PostgreSQL nazywa się
  `service_key`. Przejściowe pole `typ_uprawnien` usunięto w Fazie 5 / kroku 5.

## Udostepnianie konfiguracji

- Publiczna czesc konfiguracji jest dostepna przez `GET /api/config/public`.
- Endpoint zwraca branding, publiczne dane miasta, aktywne uslugi, locale, mape i jawne feature flags.
- Endpoint nie zwraca sekretow ani wewnetrznych ustawien integracji.
- Odpowiedz zawiera `configVersion` i checksum SHA-256 zrodlowego YAML-a. Silny ETag jest
  wyliczany z dokladnej publicznej reprezentacji JSON, aby zmiana projekcji uniewazniala cache
  nawet bez zmiany YAML-a. `If-None-Match` zwraca `304`, a `Cache-Control` ma wartosc
  `public, max-age=60, must-revalidate`.
- Publiczny kontrakt jest jawna allowlista. Zawiera `routing.fallbackServiceKey`, poniewaz UI
  uzywa go do prezentacji kategorii awaryjnej; `services` zawiera tylko aktywne uslugi.
  Ustawienia dostawcow, timeouty, dane polaczeniowe i sekrety pozostaja poza odpowiedzia.
- Backend i authorization korzystaja z tego samego loadera i zamontowanego artefaktu, bez dodatkowej zaleznosci HTTP miedzy nimi.
- Repliki loguja `configVersion` i checksum; rollout zapewnia spojnosc wersji.

## Lokalizacja i funkcje

- Decyzja o interaktywnej mapie została zmieniona 2026-07-27: frontend nie używa Leaflet,
  MapLibre ani osadzonego Google Maps.
- Formularz zapisuje wymagany adres tekstowy bez geokodowania i współrzędnych.
- Administrator oraz służba mogą otworzyć adres jako cel trasy w Google Maps.
- Pola `map` i `features.map` pozostają w schema v1 wyłącznie przejściowo; wszystkie aktywne
  YAML-e ustawiają `map: null` i `features.map: false`, a frontend ich nie projektuje.
- Feature flags pozostają jawnie zdefiniowane w schemacie, np. klasyfikacja LLM i anonimowe
  zgłoszenia.
- Provider, model, timeouty i sekrety LLM nie sa czescia publicznego configu produktu.

## Kontrakt poczatkowy

```yaml
schemaVersion: 1
configVersion: 'zglosto-2026-01'

city:
  key: zglosto
  displayName:
    'pl-PL': 'Warszawa'
    en: 'Warsaw'
  defaultLocale: 'pl-PL'
  supportedLocales:
    - 'pl-PL'
    - 'en'
  timezone: 'Europe/Warsaw'

branding:
  logoPath: '/assets/city-logo.svg'
  emblemAlt:
    'pl-PL': 'Herb miasta Warszawy'
    en: 'Coat of arms of Warsaw'
  faviconPath: '/assets/favicon.svg'
  colors:
    primary: '#0057B8'
    secondary: '#FFFFFF'
    accent: '#F5A623'

contact:
  email: 'kontakt@zglosto.example'
  phone: '+48 22 000 00 00'
  website: 'https://zglosto.example'
  address:
    'pl-PL': 'ul. Przykladowa 1, 00-001 Warszawa'
    en: '1 Example Street, 00-001 Warsaw'
  officeHours:
    'pl-PL': 'Poniedzialek-piatek, 8:00-16:00'
    en: 'Monday-Friday, 8:00-16:00'

localContent:
  siteTitle:
    'pl-PL': 'ZglosTO - Warszawa'
    en: 'ZglosTO - Warsaw'
  siteDescription:
    'pl-PL': 'Miejski system zglaszania incydentow w Warszawie.'
    en: 'Municipal incident reporting system for Warsaw.'
  footerText:
    'pl-PL': 'Warszawa dziekuje za odpowiedzialne zglaszanie problemow.'
    en: 'Warsaw thanks you for reporting local problems responsibly.'
  legalNotice:
    'pl-PL': 'Zgloszenie nie zastepuje kontaktu z numerem alarmowym 112.'
    en: 'A report does not replace contacting the 112 emergency number.'
  reportAddressPlaceholder:
    'pl-PL': 'np. ul. Glowna 123, Warszawa'
    en: 'e.g. 123 Main Street, Warsaw'

services:
  - key: roads
    label:
      'pl-PL': 'Zarzad Drog'
      en: 'Road Authority'
    shortLabel:
      'pl-PL': 'ZD'
      en: 'Roads'
    enabled: true
    sortOrder: 10
    iconKey: road
    description: null
    color: '#EA580C'
  - key: public_transit
    label:
      'pl-PL': 'Miejskie Przedsiebiorstwo Komunikacyjne'
      en: 'Municipal Public Transport Company'
    shortLabel:
      'pl-PL': 'MPK'
      en: 'Transit'
    enabled: true
    sortOrder: 20
    iconKey: bus
    description: null
    color: '#2563EB'
  - key: other
    label:
      'pl-PL': 'Inne'
      en: 'Other'
    shortLabel:
      'pl-PL': 'Inne'
      en: 'Other'
    enabled: true
    sortOrder: 999
    iconKey: circle_help
    description:
      'pl-PL': 'Zgloszenia wymagajace recznej weryfikacji'
      en: 'Reports requiring manual review'
    color: '#6B7280'

routing:
  fallbackServiceKey: other

map:
  provider: osm
  center:
    lat: 52.2297
    lng: 21.0122
  zoom: 12
  bounds: null
  tilesUrl: null
  attribution: null

features:
  map: true
  llmClassification: true
  anonymousReports: false
```

## Frontend docelowy

- Docelowym frameworkiem jest TanStack Start; przed Faza 8 wykonujemy kontrolny przeglad gotowosci produkcyjnej.
- Fallbackiem jest React/Vite z TanStack Router i TanStack Query. Astro nie jest glownym frontendem aplikacji.
- TanStack Query obsluguje stan serwerowy, cache, invalidacje oraz mutacje.
- TanStack Table nie jest obecnie częścią wdrażanego stosu: bieżące listy są widokami
  kart i nie uzasadniają dodatkowej abstrakcji. Do biblioteki wracamy wyłącznie po
  pojawieniu się złożonego widoku tabelarycznego, paginacji serwerowej, operacji
  zbiorczych, konfigurowalnych kolumn, eksportu albo wirtualizacji.
- TanStack Form z Zod jest wspólnym standardem wszystkich formularzy zapisujących dane
  użytkownika. Zod waliduje i normalizuje wejście, TanStack Form zarządza stanem
  formularza, a serwer zawsze wykonuje niezależną walidację.
- Design system docelowo korzysta z lokalnych komponentow shadcn/ui opartych na Base UI. Migracja z Radix jest progresywna i odbywa sie w Fazie 8A przed TanStack Start.
- TanStack Start pozostaje warstwa web/BFF. NestJS jest jedynym API domenowym i wlascicielem autoryzacji danych.
- React Native korzysta w przyszlosci z NestJS i authorization, nie z prywatnych server functions TanStack Start.

## Kryteria ukonczenia Fazy 2

- Schemat Zod i typ TypeScript sa wspolnym kontraktem.
- Domyslny YAML ZglosTO przechodzi strict validation.
- Co najmniej druga konfiguracja testowa przechodzi te same testy kontraktowe.
- Frontend nie ma zahardcodowanej nazwy miasta ani listy sluzb.
- API i baza uzywaja stabilnych `serviceKey` albo udokumentowanej warstwy kompatybilnosci migracyjnej.
- Bledny config blokuje readiness i daje czytelny blad bez ujawniania sekretow.
- Publiczny endpoint zwraca tylko bezpieczna czesc konfiguracji i obsluguje wersje/cache.
