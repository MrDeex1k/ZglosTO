# Akceptacja ryzyka `image-size` dla kandydata 1.0.0

Status: **zaakceptowane warunkowo do 2026-09-25**  
Właściciel decyzji: właściciel repozytorium  
Zakres: wyłącznie lokalny pipeline build/export aplikacji `Mobile`

## Ustalenie

Aktualny lockfile zawiera `image-size@1.2.1`, a nie `2.0.2`. Pakiet jest zależnością
przechodnią `Metro 0.84.4`, osiągalną wyłącznie przez graf Expo/React Native zaczynający
się w workspace `Mobile`. `pnpm audit --prod` zgłasza dwa problemy `high`:

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

## Kontrole kompensujące

1. `node scripts/check-mobile-build-assets.ts` sprawdza wszystkie publikowane assety Mobile
   przed Metro. Dopuszcza PNG, JPEG, WebP, GIF i SVG, a blokuje rozszerzenia oraz sygnatury
   ICNS, JXL, JPEG 2000 i rodziny HEIF, także po zmianie rozszerzenia pliku.
2. Asset z niezaufanego pull requesta nie może być budowany na zaufanym komputerze przed
   przeglądem. Projekt nie uruchamia obecnie centralnego CI dla niezaufanych forków.
3. Docelowy kontrakt obrazów wymusza brak pakietu `image-size` w produkcyjnych obrazach
   Authorization, backendu/media workera i `llm_gateway`.
4. `pnpm audit:release` akceptuje tylko oba powyższe GHSA, dokładnie dla
   `image-size@1.2.1`, jeśli każda ścieżka zaczyna się w `Mobile` i kończy w
   `metro>image-size`. Każde inne advisory pozostaje błędem.
5. Wyjątek wygasa automatycznie 2026-09-25. Wcześniejszy przegląd jest obowiązkowy po
   aktualizacji Expo, React Native lub Metro albo po publikacji obsługiwanej poprawki.

## Kryterium zamknięcia

Wyjątek należy usunąć, gdy lockfile nie zawiera podatnej wersji lub gdy wspierany graf
Expo/Metro dostarczy poprawkę. Wtedy `pnpm audit:release` celowo zakończy się błędem
„accepted advisory is no longer present”, aby wymusić usunięcie nieaktualnej akceptacji.
