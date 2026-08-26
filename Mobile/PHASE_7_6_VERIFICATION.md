# Weryfikacja kroku 7.6 — regresja i narzędzia Mobile

Data: **2026-08-25**.

## Wynik

**PASS** dla aktywnej macierzy Mobile: Pixel 9 Android Emulator oraz iPhone 17 Pro
Simulator z iOS 26.5. Nie testowano urządzeń fizycznych ani iPada.

## Wersjonowany zestaw regresji

Regresja jest uruchamiana przez `agent-device test --maestro`, ale scenariusze pozostają
zwykłymi, czytelnymi plikami Maestro:

- `e2e/phase7-resident-regression.yaml` — feed publiczny, szczegóły przez deep link,
  logowanie mieszkańca, jego dane i wylogowanie;
- `e2e/phase7-service-regression.yaml` — kolejka przypisanej służby, izolacja od części
  publicznej, próba publicznego deep linku i wylogowanie;
- `e2e/phase7-admin-regression.yaml` — komunikat o wymaganym komputerze, brak linku WEB,
  odrzucenie publicznego deep linku i wylogowanie;
- `e2e/phase7-normalize-session.yaml` — bezpieczne doprowadzenie symulatora do sesji
  anonimowej bez zależności od stanu pozostawionego przez poprzedni test;
- `scripts/run-phase7-regression.sh` — pobiera wyłącznie ignorowane, losowe credentials
  demo i zapisuje ignorowane artefakty diagnostyczne.

Uruchomienie:

```bash
AGENT_DEVICE_PLATFORM=android AGENT_DEVICE_DEVICE='Pixel 9' pnpm mobile:regression
AGENT_DEVICE_PLATFORM=ios AGENT_DEVICE_DEVICE='iPhone 17 Pro' pnpm mobile:regression
```

## Wyniki urządzeniowe

| Platforma                          | Scenariusze                                    | Wynik    | Czas końcowego przebiegu |
| ---------------------------------- | ---------------------------------------------- | -------- | ------------------------ |
| Android Emulator / Pixel 9         | publiczny + mieszkaniec, służba, administrator | 3/3 PASS | 148,9 s                  |
| iOS 26.5 / iPhone 17 Pro Simulator | publiczny + mieszkaniec, służba, administrator | 3/3 PASS | 235,9 s                  |

Oba wyniki dotyczą dokładnie tej samej końcowej wersji plików YAML i tych samych
syntetycznych fixture'ów.

## Stabilność danych testowych

Osiem profesjonalnie opisanych incydentów demo ma stałe UUID-y `...0071`–`...0078`.
Pozwala to testować deep link bez technicznych nazw typu `Phase3.*`. Konta używają domeny
`example.test`, hasła są losowe, lokalne, ignorowane przez Git i mają prawa `0600`.

Po ponownym seedzie nginx może trzymać publiczny feed przez maksymalnie 15 minut. Pełny
Quick Start tworzy świeże środowisko; przy ręcznym reseedzie przed natychmiastowym E2E
należy odtworzyć kontener nginx albo poczekać na wygaśnięcie cache.

## Pozostałe pokrycie regresyjne

Nowy smoke 7.6 celowo nie duplikuje całej historii długich scenariuszy urządzeniowych:

- cold start, odtworzenie sesji i cleanup mają wynik PASS w
  `PHASE_6_ACCEPTANCE.tsv` na tej samej aktywnej macierzy;
- offline/reconnect, cache konfiguracji i polityki sieciowe są pokryte scenariuszami Fazy 2
  i 5 oraz bieżącymi testami jednostkowymi;
- wybór, checksum, upload, prywatny odczyt i cleanup zdjęć są pokryte Fazą 3.5–3.7,
  Fazą 5 oraz bieżącym zestawem 132 testów;
- rzeczywisty formularz ze zdjęciem został ponownie użyty do materiału 7.4.

Próba dodania cold startu bezpośrednio do nowego replaya ujawniła niestabilność samego
development clienta Expo przy ponownym otwieraniu URL-a Metro (`EventEmitter` podczas
drugiego runtime). Nie uznano tego za regresję produktu ani za PASS tego konkretnego
mechanizmu; 7.6 opiera decyzję cold-start na osobnym, wcześniej zaliczonym kontrakcie
Fazy 6.

## Bramki kodu

- Mobile lint — PASS;
- TypeScript — PASS;
- Vitest — 30 plików, 132/132 PASS;
- Expo Doctor — 21/21 PASS;
- audyt publicznego repozytorium — 983 pliki, PASS;
- dwa syntetyczne warianty White-Label — PASS;
- development build Android — `BUILD SUCCESSFUL`;
- development build iOS — `Build Succeeded`.
