# Faza 7.0 — kontrakt Source Ready / Client-Built

Data zamrożenia: 2026-08-25.

## Cel

Faza 7 przygotowuje publiczne, reprezentacyjne i powtarzalne repozytorium ZgłosTO. Kod
Mobile jest gotowy, ale nie udaje wspólnego wdrożenia ani publikacji App Store/Google Play.
Każdy licencjonowany klient buduje aplikację dla własnej instancji.

Końcowa decyzja ma postać:

```text
SOURCE READY / CLIENT-BUILT / NOT STORE-PUBLISHED
```

## Zakres Mobile 1.0

- anonimowy i mieszkaniec: publiczny obszar, zgłoszenie i Panel Mieszkańca;
- pracownik służb: wyłącznie Panel Służb;
- administrator: komunikat o wymaganym komputerze i wylogowanie;
- PL/EN, White-Label, zdjęcia, sesja, deep linki custom scheme i jawny cache offline;
- lokalne Android/iOS buildy i regresja na aktywnej macierzy emulatorów.

Poza zakresem źródłowego wydania pozostają signing klienta, jego domena produkcyjna,
Universal/App Links, crash reporting, testy fizycznych urządzeń oraz opcjonalna dystrybucja
sklepowa. Elementy te należą do konkretnego wdrożenia klienta.

## Wspólne governance

Mobile dziedziczy główne `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CLA.md`, szablony
GitHub, Conventional Commits, PNPM/SFW, karencję zależności oraz obowiązek ujawniania
istotnego użycia AI. Kopie dokumentów governance w `Mobile/` są zabronione.

Pomysły i niewrażliwe błędy trafiają do GitHub Issues. Większe funkcje, architektura i
zależności są omawiane przed implementacją. Podatności trafiają wyłącznie do GitHub Private
Vulnerability Reporting.

## Strategia testowa

- Maestro pozostaje źródłowym, deterministycznym formatem regresji E2E;
- agent-device CLI/MCP służy interaktywnej eksploracji, diagnostyce i dowodom;
- podstawowy Quick Start nie zależy od żadnego narzędzia AI;
- mutacje jednej sesji urządzenia nie są wykonywane równolegle.

## Właściciele

`Mobile/OWNERS.tsv` nadal zawiera nieprzypisane role. Dlatego w 7.1 nie dodajemy
`CODEOWNERS` z wymyślonym właścicielem. Przypisanie nastąpi po jawnej decyzji właściciela
repozytorium i nie blokuje statycznego kontraktu 7.0.

## Brama 7.0

- zakres i elementy odroczone są jawne;
- wspólne governance ma jedno źródło prawdy;
- strategia agent-device/Maestro jest zamrożona;
- istnieje [PHASE_7_ACCEPTANCE.tsv](PHASE_7_ACCEPTANCE.tsv).

Status: **PASS — implementacja kolejnych kroków Fazy 7 może być kontynuowana.**
