# Przekazanie ZgłosTO Mobile klientowi

## Status produktu

Kod ma status **SOURCE READY / CLIENT-BUILT / NOT STORE-PUBLISHED**. Funkcjonalny zakres
Mobile 1.0 jest zaimplementowany. ZgłosTO przekazuje repozytorium źródłowe; każdy
licencjonowany klient konfiguruje, buduje, podpisuje, wdraża i utrzymuje własny wariant
połączony wyłącznie z jego własną instancją systemu.

## Co otrzymuje klient

- aplikację Expo/React Native dla iOS, iPadOS i Androida;
- publiczny feed i szczegóły, część mieszkańca oraz część przypisanej służby;
- blokadę administratora na Mobile 1.0 — komunikat o wymaganym komputerze i wylogowanie;
- jeden kontrakt White-Label konsumowany także przez WEB/backend;
- syntetyczne demo, wersjonowane testy i dokumentację architektury;
- wspólne zasady bezpieczeństwa, współtworzenia i licencjonowania monorepo.

Punkty wejścia: [QUICK_START.md](QUICK_START.md),
[CLIENT_CONFIGURATION.md](CLIENT_CONFIGURATION.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[API_AND_AUTH.md](API_AND_AUTH.md) oraz [CURRENT_STATE.md](CURRENT_STATE.md).

## Konfiguracja White-Label

Nowy klient dostarcza nazwę i klucz miasta, języki, strefę czasową, kolory, assety z
prawami do użycia, publiczny kontakt, teksty prawne, katalog służb i polityki funkcji.
Konfigurację dodaje się jako wersjonowany YAML zgodnie z
[CLIENT_CONFIGURATION.md](CLIENT_CONFIGURATION.md), bez sekretów i bez zmian w logice
domenowej Mobile.

Jedna instalacja obsługuje jedno miasto. Wdrożenia klientów nie współdzielą bazy,
Object Storage, kont, sekretów ani runtime aplikacji.

Każdy wariant musi przejść:

```bash
pnpm check:mobile-client-configs
pnpm test:white-label-builds
```

## Środowiska i sekrety

- `EXPO_PUBLIC_*` może zawierać wyłącznie dane publiczne, które wolno umieścić w bundlu;
- cookie sesji przechowuje oficjalna integracja Better Auth/Expo w SecureStore;
- credentials demo są losowe, lokalne, ignorowane przez Git i odtwarzalne przez seed;
- produkcyjne hasła, signing, certyfikaty, tokeny i connection strings należą do
  zewnętrznego secret managera/CI, a nie do repozytorium;
- demo działa na loopback HTTP tylko w jawnym środowisku `development`; produkcja wymaga
  stałego HTTPS originu.

## Dane, backup i utrzymanie

Mobile jest klientem API i nie jest źródłem prawdy dla danych. Backend oraz baza odpowiadają
za retencję, backup, odtwarzanie, audyt i usuwanie danych. Na urządzeniu pozostają tylko
SecureStore, kontrolowany cache prywatnych obrazów i cache zapytań opisane w
[STATE_AND_STORAGE.tsv](STATE_AND_STORAGE.tsv). Wylogowanie i zmiana zakresu sesji czyszczą
stan prywatny.

Właściciel wdrożenia musi przed produkcją ustalić:

- RPO/RTO, harmonogram backupów i regularny test restore;
- retencję zgłoszeń, zdjęć, logów i kont;
- procedurę incydentową oraz osoby z [OWNERS.tsv](OWNERS.tsv);
- cykl aktualizacji Expo/React Native i zależności z osobną regresją obu platform;
- monitoring dostępności API i bezpieczny crash reporting bez PII.

## Licencja i bezpieczeństwo

Mobile podlega głównym [LICENSE](../LICENSE), [SECURITY.md](../SECURITY.md),
[CONTRIBUTING.md](../CONTRIBUTING.md) i [CLA.md](../CLA.md). PolyForm Internal Use License
1.0.0 jest licencją source-available, nie klasyczną licencją open source. Użycie wykraczające
poza jej warunki, w tym uzgodnienia komercyjne, wymaga osobnego porozumienia z
licencjodawcą. Podatności należy zgłaszać wyłącznie prywatnym kanałem z `SECURITY.md`.

## Droga od źródeł do instancji klienta

Przed betą lub wdrożeniem należy:

1. wskazać właścicieli produktu, bezpieczeństwa, infrastruktury i publikacji;
2. dostarczyć stałą domenę, HTTPS edge oraz produkcyjny hosting API;
3. skonfigurować i zweryfikować Universal Links/App Links wraz z fallbackiem WEB;
4. zatwierdzić politykę prywatności, retencję, zgody, deklaracje sklepów i prawa do assetów;
5. wybrać crash reporting/monitoring z filtrowaniem PII;
6. skonfigurować identyfikatory aplikacji, entitlements i lokalne warianty buildów klienta;
7. zabezpieczyć signing; konta Apple Developer/Google Play są potrzebne tylko przy wyborze
   dystrybucji w odpowiednim sklepie;
8. przetestować fizycznego iPhone'a, fizycznego Androida, iPada, minimalne systemy,
   aparat, bibliotekę zdjęć, Keychain/Keystore i rzeczywistą sieć;
9. wykonać security review, test restore backupu, test obciążenia oraz plan rollbacku;
10. jeśli klient wybiera sklepy, przejść TestFlight/Internal Testing i kontrolowany rollout.

## Znane ograniczenia

- brak centralnych GitHub Actions i automatycznych buildów — zgodnie z modelem Client-Built;
- brak wspólnego binarnego artefaktu release — binaria buduje konkretny klient;
- brak stałej domeny i aktywnych Universal/App Links;
- brak analityki i crash reportingu;
- brak testów na fizycznych urządzeniach, iPadzie i starszych systemach w bieżącej macierzy;
- brak wspólnych kont sklepowych i signingów — należą do konkretnego klienta;
- pełny tryb offline submit, push, mapa w aplikacji i panel administratora są poza 1.0.

## Checklista odbioru repozytorium

- [ ] Quick Start działa na maszynie odbiorcy z syntetycznymi danymi;
- [ ] odbiorca rozumie rozłączne role Mobile 1.0;
- [ ] wybrany wariant White-Label przechodzi obie bramki konfiguracji;
- [ ] nie użyto credentials ani danych demonstracyjnych jako produkcyjnych;
- [ ] zaakceptowano licencję source-available i kanał security;
- [ ] wybrany kanał dystrybucji i jego ograniczenia są zapisane w backlogu klienta;
- [ ] właściciele operacyjni i warunki produkcji są formalnie przypisani.
