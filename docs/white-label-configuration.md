# Konfiguracja miasta

Przygotuj własną konfigurację ZgłosTO: nazwę miasta, identyfikację wizualną, kontakt
i katalog służb. Na końcu zweryfikujesz YAML, zbudujesz WEB i sprawdzisz konfigurację
odczytaną przez uruchomione API.

Przykład używa fikcyjnego miasta **Nowy Brzeg**. Dotyczy lokalnej instalacji WEB/API;
nie zastępuje [odbioru produkcyjnego](phase-12-white-label-rollout.md).

> Jedna instalacja obsługuje jedno miasto. YAML jest publiczną konfiguracją, nie miejscem
> na hasła, tokeny, prywatne adresy usług ani interpolację `${ENV}`. Sekrety i połączenia
> usług skonfiguruj osobno przez [zmienne środowiskowe](environment-variables.md).

## 1. Utwórz plik miasta

Przygotuj narzędzia i zależności według [uruchomienia lokalnego](local-development.md).
Wszystkie polecenia w tym przewodniku wykonuj z katalogu głównego repozytorium.

Skopiuj [konfigurację wzorcową](../config/white-label/zglosto.yaml), zachowując oryginał:

```bash
test -f config/white-label/nowy_brzeg.yaml || \
  cp config/white-label/zglosto.yaml config/white-label/nowy_brzeg.yaml
```

W kolejnych krokach **zastępuj całe wskazane sekcje** w skopiowanym pliku. Nie dopisuj
drugiego klucza `city`, `branding` czy `services` na końcu YAML. Bloki poniżej składają się
na kompletny przykład; adresy w domenie `.example` trzeba zastąpić przed wdrożeniem.

## 2. Ustaw tożsamość i języki

Zastąp nagłówek oraz sekcję `city`:

```yaml
schemaVersion: 1
configVersion: 'nowy-brzeg-2026-09-08-01'
city:
  key: nowy_brzeg
  displayName:
    'pl-PL': 'Nowy Brzeg'
    en: 'Nowy Brzeg'
  defaultLocale: 'pl-PL'
  supportedLocales: ['pl-PL', 'en']
  timezone: 'Europe/Warsaw'
```

- `city.key` to stabilny identyfikator, nie nazwa wyświetlana. Ma 2–64 znaki, zaczyna się
  małą literą i zawiera tylko małe litery ASCII, cyfry lub `_`. Nie używaj myślników.
- `configVersion` zmieniaj przy każdej publikowanej zmianie. Dozwolone są małe litery,
  cyfry, kropki, `_` i `-`; pierwszy znak musi być literą lub cyfrą, długość do 128 znaków.
- Aktualny kontrakt obsługuje `pl-PL` i `en`, nie `en-US`. Język domyślny musi znajdować
  się w `supportedLocales`; wartości na liście nie mogą się powtarzać.
- Wszystkie pola wielojęzyczne wymagają obu niepustych tłumaczeń, nawet gdy na liście
  wspieranych języków pozostawisz tylko polski. Strefą wdrożenia jest `Europe/Warsaw`.

## 3. Dodaj branding i materiały miasta

Zastąp sekcję `branding`:

```yaml
branding:
  logoPath: '/assets/nowy-brzeg-logo.svg'
  emblemAlt:
    'pl-PL': 'Znak miasta Nowy Brzeg'
    en: 'Nowy Brzeg city mark'
  faviconPath: '/assets/nowy-brzeg-favicon.svg'
  colors:
    primary: '#0057B8'
    secondary: '#FFFFFF'
    accent: '#D97706'
```

Umieść własne, zaufane pliki SVG w `frontend/public/assets/`. Żeby najpierw sprawdzić
sam proces, możesz skopiować znaki demonstracyjne; nie są one identyfikacją nowego miasta:

```bash
test -f frontend/public/assets/nowy-brzeg-logo.svg || \
  cp frontend/public/assets/city-logo.svg frontend/public/assets/nowy-brzeg-logo.svg
test -f frontend/public/assets/nowy-brzeg-favicon.svg || \
  cp frontend/public/assets/favicon.svg frontend/public/assets/nowy-brzeg-favicon.svg
```

| Plik w repozytorium                             | Publiczny adres po buildzie      |
| ----------------------------------------------- | -------------------------------- |
| `frontend/public/assets/nowy-brzeg-logo.svg`    | `/assets/nowy-brzeg-logo.svg`    |
| `frontend/public/assets/nowy-brzeg-favicon.svg` | `/assets/nowy-brzeg-favicon.svg` |

Nie wpisuj `frontend/public` do YAML. Kontrakt dopuszcza też publiczne URL-e HTTP(S),
ale lokalne pliki nie wymagają zewnętrznego hostingu. Walidacja YAML sprawdza format
ścieżki, **nie istnienie obrazu**. Kolory muszą mieć format `#RRGGBB`; zapisuj je
w cudzysłowach, ponieważ `#` poza nimi rozpoczyna komentarz YAML.

Sprawdź czytelność tekstu, kontrast przycisków i widoczność logo w jasnym oraz ciemnym
motywie. Te tokeny konfigurują WEB; dokumentacja ma obecnie własny motyw i nie przejmuje
automatycznie brandingu z YAML.

## 4. Uzupełnij kontakt i treści

Zastąp sekcje `contact` i `localContent`:

```yaml
contact:
  email: 'kontakt@nowy-brzeg.example'
  phone: null
  website: 'https://nowy-brzeg.example'
  address:
    'pl-PL': 'ul. Miejska 1, Nowy Brzeg'
    en: '1 Miejska Street, Nowy Brzeg'
  officeHours:
    'pl-PL': 'Poniedziałek–piątek, 8:00–16:00'
    en: 'Monday–Friday, 08:00–16:00'
localContent:
  siteTitle:
    'pl-PL': 'Nowy Brzeg — ZgłosTO'
    en: 'Nowy Brzeg — ZgłosTO'
  siteDescription:
    'pl-PL': 'Zgłoś usterkę i sprawdź postęp jej rozwiązania.'
    en: 'Report a local issue and track its resolution.'
  footerText:
    'pl-PL': 'Serwis zgłoszeń miasta Nowy Brzeg.'
    en: 'Issue reporting for the city of Nowy Brzeg.'
  legalNotice:
    'pl-PL': 'Serwis nie obsługuje alarmów. W nagłym zagrożeniu zadzwoń pod 112.'
    en: 'This service does not handle emergencies. In an emergency, call 112.'
  reportAddressPlaceholder:
    'pl-PL': 'np. ul. Miejska 1, Nowy Brzeg'
    en: 'e.g. 1 Miejska Street, Nowy Brzeg'
```

E-mail i adres są wymagane. `phone`, `website` oraz całe `officeHours` mogą mieć wartość
`null`; nie zastępuj nią wymaganych tłumaczeń. Kontakt jest informacją dla mieszkańca,
nie konfiguracją SMTP. Zachowaj jasne ostrzeżenie o numerze 112 i uzgodnij treści prawne
z operatorem przed publikacją.

## 5. Zdefiniuj służby i fallback

Na pierwszą, nową instalację wystarczą dwa wpisy. Zastąp całe `services` i `routing`:

```yaml
services:
  - key: roads
    label:
      'pl-PL': 'Zarząd dróg'
      en: 'Road maintenance'
    shortLabel:
      'pl-PL': 'Drogi'
      en: 'Roads'
    enabled: true
    sortOrder: 10
    iconKey: road
    description: null
    color: '#0057B8'
  - key: other
    label:
      'pl-PL': 'Zespół weryfikacji zgłoszeń'
      en: 'Report review team'
    shortLabel:
      'pl-PL': 'Pozostałe'
      en: 'Other'
    enabled: true
    sortOrder: 999
    iconKey: circle_help
    description:
      'pl-PL': 'Zgłoszenia wymagające ręcznego przypisania służby.'
      en: 'Reports requiring manual service assignment.'
    color: '#64748B'
routing:
  fallbackServiceKey: other
```

Każda służba wymaga stabilnego `key` o tych samych regułach co `city.key`. Klucze
i nieujemne, całkowite `sortOrder` muszą być unikalne, także we wpisach wyłączonych.
Co najmniej jedna służba musi być aktywna. `fallbackServiceKey` musi wskazywać istniejącą,
aktywną służbę — tu zespół przyjmujący sprawy do ręcznej weryfikacji.

Dostępne `iconKey`: `bus`, `circle_help`, `greenery`, `lighting`, `road`, `safety`,
`trash`, `utilities`, `water`. `description` i `color` mogą mieć wartość `null`.

> W istniejącej instalacji nie zastępuj bezrefleksyjnie całego katalogu przykładem.
> Synchronizacja zapisuje klucze służb w bazie i dezaktywuje pominięte wpisy. Zmiana
> etykiety nie wymaga zmiany klucza; zmiana klucza nie przenosi historii zgłoszeń.
> Dodanie służby do YAML nie tworzy jej konta ani nie nadaje użytkownikom uprawnień.

## 6. Zacznij bez mapy i klasyfikacji LLM

Zastąp sekcje `map` i `features`:

```yaml
map: null
features:
  map: false
  llmClassification: false
  anonymousReports: true
```

To publiczne deklaracje konfiguracji, nie zamiennik kontroli dostępu ani konfiguracji
runtime. Samo `llmClassification: true` nie uruchamia modelu — lokalny profil ma
osobne `LLM_RUNTIME=disabled`. Nie traktuj `anonymousReports: false` jako potwierdzonej
blokady anonimowych żądań API; aktualne ścieżki zgłoszeń nie egzekwują tej flagi.

Kontrakt wymaga niepustej konfiguracji `map`, jeżeli `features.map` jest `true`.
Włączenie mapy i odbiór konkretnego dostawcy zostaw na osobny test integracji;
poprawny YAML nie dowodzi dostępności funkcji w interfejsie.

## 7. Zweryfikuj YAML i zbuduj WEB

Najpierw zbuduj kontrakty, a następnie uruchom właściwy walidator dla swojego pliku:

```bash
bun run --filter @zglosto/contracts build
bun run config:metadata config/white-label/nowy_brzeg.yaml json
```

Poprawny wynik zawiera `cityKey: "nowy_brzeg"`, ustawione `configVersion`, 64-znakowy
`checksum` i ścieżkę pliku. Błąd odczytu, składni albo kontraktu kończy polecenie
niepowodzeniem. Suma SHA-256 dotyczy bajtów YAML: zmiana komentarza lub formatowania
również ją zmienia. Po walidacji nie edytuj pliku pomiędzy buildami poszczególnych usług.

Sprawdź build frontendu z tą samą konfiguracją. Ścieżka bezwzględna unika różnicy między
katalogiem głównym a katalogiem pakietu uruchamianego przez filtr Bun:

```bash
bun run --filter @zglosto/contracts --filter @zglosto/i18n --filter @zglosto/white-label-config --if-present build
WHITE_LABEL_CONFIG="$PWD/config/white-label/nowy_brzeg.yaml" \
  bun run --filter frontend-zglosto build
cat frontend/dist/client/health/ready.json
```

W artefakcie sprawdź `config.status: "valid"` oraz zgodność `configVersion` i `checksum`
z walidatorem. To test builda WEB, nie uruchomienie API. Polecenie
`bun run test:white-label-builds` sprawdza osobno repozytoryjne konfiguracje `test-*.yaml`;
nie zastępuje walidacji ani builda Twojego pliku.

## 8. Uruchom spójną instalację lokalną

Użyj środowiska przeznaczonego dla tego miasta. Nie podmieniaj konfiguracji instalacji
innego klienta ani nie współdziel jego bazy, obiektów i sekretów. Samo inne
`--project-name` nie izoluje obecnego Compose w pełni: pozostają stała nazwa kontenera
PostgreSQL i publikowane porty. Nie uruchamiaj tak równolegle drugiego miasta.

Przygotuj `.env` i certyfikaty zgodnie z [instrukcją lokalną](local-development.md).
W swoim `.env` ustaw poniższe dwie wartości, zachowując pozostałą konfigurację:

```dotenv
WHITE_LABEL_CONFIG_FILE=config/white-label/nowy_brzeg.yaml
WHITE_LABEL_CONFIG=/app/config/city.yaml
```

| Ustawienie                | Znaczenie                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `WHITE_LABEL_CONFIG_FILE` | Plik w repozytorium: argument builda obrazów i źródło montowania do kontenerów.                         |
| `WHITE_LABEL_CONFIG`      | Ścieżka odczytywana wewnątrz backendu i Authorization; w tym Compose pozostaje `/app/config/city.yaml`. |

Następnie zbuduj i odtwórz kontenery, aby procesy wczytały wybraną konfigurację:

```bash
docker compose config --quiet
docker compose up -d --build --force-recreate
docker compose ps
```

Polecenie odtworzenia przerywa pracę lokalnych kontenerów; nie usuwa ich nazwanych
wolumenów. Nie używaj go jako procedury aktualizacji produkcji. Frontend ma konfigurację
wbudowaną w obraz, backend i Authorization ładują ją przy starcie. Sam restart frontendu
bez builda albo sama podmiana YAML nie zapewnią zgodności.

## 9. Odbierz konfigurację

Sprawdź publiczne API i artefakt konfiguracji wewnątrz kontenera frontendu:

```bash
curl --fail --silent --show-error http://localhost:1235/api/config/public
curl --fail --silent --show-error http://localhost:1235/api/health/ready
docker compose exec -T frontend wget -q -O - http://127.0.0.1:8080/health/ready
```

API publiczne zwraca `configVersion`, `checksum` oraz `config`, w tym tylko aktywne
służby. Porównaj wersję i sumę kontrolną z krokiem 7 i readiness frontendu. Readiness API
może zwrócić 503 z powodu bazy lub storage mimo poprawnego YAML — wtedy sprawdź
[healthchecki usług](healthchecks.md), w tym osobny probe mTLS dla Authorization.
Publiczny `/health` Nginx nie potwierdza zgodności konfiguracji wszystkich usług.

W [aplikacji lokalnej](http://localhost:1235) sprawdź:

- nazwę miasta, tytuł karty, logo, faviconę, kontakt i ostrzeżenie o numerze 112;
- polską i angielską wersję oraz czytelność obu motywów;
- listę służb i kolejność „Drogi”, „Pozostałe”;
- próbne zgłoszenie, jego widoczność w odpowiednim panelu i przypisanie do służby.

## Gdy coś nie działa

| Objaw                             | Co sprawdzić                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| Walidacja odrzuca język lub tekst | Użyj `en`, nie `en-US`; każde pole wielojęzyczne wymaga obu tłumaczeń.                        |
| Błąd `fallbackServiceKey`         | Klucz musi istnieć w `services` i mieć `enabled: true`.                                       |
| Błąd koloru                       | Użyj sześciu cyfr szesnastkowych i cudzysłowów, np. `'#0057B8'`.                              |
| Nie znaleziono YAML               | Dla builda Bun użyj ścieżki bezwzględnej; w Compose rozróżnij plik hosta i ścieżkę kontenera. |
| Logo lub favicona zwraca 404      | Sprawdź plik w `frontend/public/assets/`, ścieżkę `/assets/...` i ponowny build.              |
| WEB pokazuje stare miasto         | Przebuduj obraz, odtwórz kontener, porównaj checksumy i odśwież przeglądarkę bez cache.       |
| API i WEB mają różne checksumy    | Użyj dokładnie tego samego pliku, bez zmian formatowania pomiędzy buildem a startem usług.    |

## Co dalej

Gotowy rezultat to wersjonowany YAML i materiały miasta, przechodzący build oraz
sprawdzony lokalnie WEB/API. Konfiguracja Mobile wymaga dodatkowo własnych zasobów,
identyfikatorów i procesu budowania — przejdź do
[konfiguracji klienta Mobile](../Mobile/CLIENT_CONFIGURATION.md).

Najpierw [wybierz profil wdrożenia](deployment-selection.md).
Przed produkcją wykonaj [checklistę wdrożenia White-Label](phase-12-white-label-rollout.md)
i [runbook produkcyjnego Compose](production-compose-runbook.md). Ten przewodnik nie
certyfikuje HTTPS, dostarczania e-maili, kopii zapasowych ani izolacji uprawnień.
