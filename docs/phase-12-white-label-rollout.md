# Faza 12 — checklista wdrożenia White-Label

Ta procedura certyfikuje nową, pojedynczą instalację miejską. Jedno wdrożenie obsługuje
jedno miasto; zmiana konfiguracji wymaga nowego builda i kontrolowanego wdrożenia.

## Dane wejściowe

1. Skopiować wzorcowy YAML do wersjonowanego pliku `config/white-label/<city>.yaml`.
2. Ustawić stabilny `city.key`, wersję konfiguracji, polski i angielski tekst, strefę
   `Europe/Warsaw`, katalog aktywnych służb oraz jawny fallback routingu.
3. Dostarczyć logo, faviconę, tekst alternatywny, dane kontaktowe, informacje prawne,
   przykładowy format adresu zgłoszenia i semantyczne tokeny marki. Nazwa miasta zostanie
   dołączona do celu trasy Google Maps w panelach administracji i służb.
4. Nie wpisywać haseł, tokenów, endpointów prywatnych ani interpolacji ENV do publicznego
   YAML. Sekrety należą wyłącznie do plików wskazanych przez produkcyjne ENV.

## Walidacja i build

```bash
pnpm config:metadata config/white-label/<city>.yaml fields
pnpm test:white-label-builds
CI=true pnpm check
pnpm build:production -- --version <git-tag> --config config/white-label/<city>.yaml
```

Manifest builda musi wskazywać dokładny Git revision, checksum konfiguracji i osiem
niezmiennych obrazów. Frontend, backend i Authorization muszą raportować tę samą wersję
oraz checksum White-Label.

## Przygotowanie instalacji

1. Wybrać dokładnie profil `minimal` albo `recommended` z kontraktu Fazy 12.
2. Uzupełnić prywatny `/etc/zglosto/production.env` oraz katalog sekretów z prawami
   `0700/0600`.
3. Skonfigurować publiczny DNS, zaufany certyfikat i automatyczne odnowienie.
4. Przygotować osobny bucket/wolumen RustFS, wolumen PostgreSQL, RabbitMQ i repozytorium
   pgBackRest.
5. Skonfigurować zaszyfrowaną kopię poza hostem; lokalny backup na tym samym SSD nie spełnia
   wymagań disaster recovery.
6. Uruchomić `PHASE12_HOST_KIND=ubuntu-production pnpm phase12:host`,
   `pnpm phase12:edge`, walidację produkcyjnego Compose i dopiero potem wdrożenie.

## Odbiór funkcjonalny

- UI działa w `pl-PL` i `en-US`, a przełącznik nie odsłania brakujących tłumaczeń;
- nazwa, logo, favicon, kolory, kontakt, mapa i lista służb pochodzą z właściwego YAML;
- formularz zawsze pokazuje uzgodnione ostrzeżenie, że ZgłosTO nie obsługuje alarmów i w
  bezpośrednim zagrożeniu należy zadzwonić pod 112;
- anonimowe zgłoszenie z e-mailem, rejestracja, weryfikacja adresu i późniejsze przejęcie
  historii działają;
- role mieszkańca, służby i administratora zachowują izolację;
- zgłoszenie z obrazem trafia do RabbitMQ, worker zapisuje WebP w Object Storage, a lista
  publiczna respektuje cache wybranego profilu;
- profile LLM/Redis odpowiadają kontraktowi i bezpiecznie degradują się po utracie
  opcjonalnej zależności.

## Odbiór operacyjny

Instalację zamyka dopiero udokumentowany restart hosta, backup/restore, rotacja certyfikatów,
test awarii, load test, godzinny soak, zmierzone RPO/RTO i podpis operatora. Pliki dowodowe
trafiają do prywatnego katalogu `.state/phase-12/`, bez sekretów i danych mieszkańców.
