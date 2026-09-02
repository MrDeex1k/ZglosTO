# Historyczna akceptacja ryzyka `image-size` dla kandydata 1.0.0

Status: **zamknięte 2026-09-02 po aktualizacji Expo/Metro**
Właściciel decyzji: właściciel repozytorium
Zakres: wyłącznie lokalny pipeline build/export aplikacji `Mobile`

> Ten dokument jest zamkniętym zapisem historycznym. Opisane niżej advisory, kontrole
> kompensujące i data wygaśnięcia nie są aktywną polityką wydaniową i nie mogą być podstawą
> ponownego wprowadzenia wyjątku. Bieżąca bramka wymaga pustej listy advisory produkcyjnych.

## Ustalenie

Lockfile kandydata 1.0.0 zawierał `image-size@1.2.1`, a nie `2.0.2`. Pakiet był zależnością
przechodnią `Metro 0.84.4`, osiągalną wyłącznie przez graf Expo/React Native zaczynający
się w workspace `Mobile`. `pnpm audit --prod` zgłaszał dwa problemy `high`:

- [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) — nieskończona
  pętla parsera ICNS;
- [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) — nieskończone
  pętle parserów JXL i HEIF.

Wpływem jest odmowa usługi procesu builda po przekazaniu złośliwego assetu. Pakiet nie
przetwarza zdjęć zgłoszeń: uploady użytkowników trafiają do backendu/media workera i są
obsługiwane przez Sharp. `image-size` nie jest też wymagany w produkcyjnych obrazach
Node.js.

Według GitHub Advisory Database na 2026-08-26 obie podatności obejmują wersje `<=2.0.2`
i nie mają opublikowanej wersji naprawionej. Nie stosujemy fikcyjnego override ani
niezweryfikowanego forka.

## Historyczne kontrole kompensujące

1. `node scripts/check-mobile-build-assets.ts` sprawdza wszystkie publikowane assety Mobile
   przed Metro. Dopuszcza PNG, JPEG, WebP, GIF i SVG, a blokuje rozszerzenia oraz sygnatury
   ICNS, JXL, JPEG 2000 i rodziny HEIF, także po zmianie rozszerzenia pliku.
2. Asset z niezaufanego pull requesta nie może być budowany na zaufanym komputerze przed
   przeglądem. Projekt nie uruchamia obecnie centralnego CI dla niezaufanych forków.
3. Docelowy kontrakt obrazów wymusza brak pakietu `image-size` w produkcyjnych obrazach
   Authorization, backendu/media workera i `llm_gateway`.
4. Ówczesny `pnpm audit:release` akceptował tylko oba powyższe GHSA, dokładnie dla
   `image-size@1.2.1`, jeśli każda ścieżka zaczyna się w `Mobile` i kończy w
   `metro>image-size`. Każde inne advisory pozostawało błędem.
5. Wyjątek miał wygasnąć automatycznie 2026-09-25, lecz został zamknięty wcześniej po
   aktualizacji Expo/Metro 2026-09-02.

## Kryterium zamknięcia

Wyjątek należy usunąć, gdy lockfile nie zawiera podatnej wersji lub gdy wspierany graf
Expo/Metro dostarczy poprawkę. Wtedy `pnpm audit:release` celowo zakończy się błędem
„accepted advisory is no longer present”, aby wymusić usunięcie nieaktualnej akceptacji.

Kryterium zostało spełnione 2026-09-02: `pnpm audit --prod` nie zgłasza żadnych podatności,
plik akceptacji maszynowej usunięto, a `pnpm audit:release` wymaga odtąd pustej listy advisory.
