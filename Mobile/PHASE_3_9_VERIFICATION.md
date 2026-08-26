# Weryfikacja kroku 3.9 — zamknięcie checkpointu Fazy 3

Data: 2026-08-20

## Decyzja

**CONTINUE — można rozpocząć Fazę 4, MVP mieszkańca.**

Faza 3 jest zakończona jako lokalny checkpoint techniczno-produktowy. Zostały
udowodnione najtrudniejsze granice architektury: natywny auth i cookie, separacja
ról, publiczne i prywatne query, upload binarny, prywatne pliki, mutacje służb oraz
bezpieczne deep linki. Decyzja nie oznacza gotowości do bety ani publikacji.

## Kryteria decyzji

- backend pozostaje źródłem prawdy dla sesji, roli, `serviceKey`, zakresu danych i
  stanu weryfikacji e-maila;
- cookie znajduje się w SecureStore i jest jawnie dodawane tylko przez
  autoryzowaną warstwę transportową;
- prywatne query i pliki są rozdzielone per użytkownik i czyszczone przy `401`
  oraz wylogowaniu;
- presigned upload nie przenosi zdjęcia przez JSON/base64, waliduje MIME, rozmiar i
  checksum oraz nie przepisuje podpisanego hosta;
- routing i deep linki korzystają z zamkniętej allowlisty, bez arbitralnego URL;
- pełny pionowy przepływ obu ról przeszedł na Android Emulator;
- iPhone Simulator potwierdził aktualny build Release, publiczne API oraz custom
  deep linki; znane luki ręcznych ścieżek prywatnych są jawnie przeniesione.

Szczegółowa macierz wyników znajduje się w
[PHASE_3_ACCEPTANCE.tsv](PHASE_3_ACCEPTANCE.tsv).

## Co zamyka checkpoint, a czego nie zamyka

Zamknięte są decyzje architektoniczne potrzebne do dalszej implementacji. Ryzyka
B-01–B-05 nie są już niewiadomymi blokującymi rozwój, ale część z nich pozostaje
bramką przed betą lub wydaniem:

- B-01, B-03 i B-04: wykazane na Androidzie; pełny regres prywatnych przepływów na
  iOS jest wymagany przed betą;
- B-02: kontrolowany HTTPS Quick Tunnel i ograniczony proxy potwierdziły model;
  stały, zaufany origin pozostaje wymaganiem środowiska preview/release;
- B-05: custom scheme i kod natywnych powiązań są gotowe; własna domena, AASA,
  `assetlinks.json` oraz fallback web pozostają wymaganiem przed release.

Nie wykonano testów iPada ani urządzeń fizycznych zgodnie z decyzją D-16. Aparat,
Keychain na sprzęcie i końcowa macierz urządzeń należą do późniejszej, jawnie
uruchamianej bramki.

## Wejście do Fazy 4

Faza 4 może rozwijać produkt na istniejącym fundamencie bez wymiany transportu,
auth, routingu, cache lub uploadu. Pierwsza kolejność to domknięcie doświadczenia
mieszkańca: rejestracja i weryfikacja e-maila, komplet stanów feedu/formularza,
historia i konto, następnie regresja i dostępność na bieżącej macierzy.

Przed uznaniem Fazy 4 za gotową do bety trzeba wykonać wszystkie pozycje oznaczone
`PARTIAL` w macierzy akceptacyjnej oraz testy dostępności. Przed release dodatkowo
trzeba zamknąć produkcyjny host, natywne powiązania domeny, podpisy i fallback web.

## Końcowa bramka jakości

- Mobile lint i typecheck: zaliczone;
- Mobile test: 22 pliki, 76 testów — zaliczone;
- eksport bundle Android i iOS: zaliczony;
- pełne `pnpm check` całego monorepo: zaliczone;
- React Doctor: 5 wcześniejszych ostrzeżeń o ręcznej memoizacji w providerach,
  bez nowego problemu w kodzie kroków 3.8–3.9;
- Expo Doctor: 20/21; jedyna uwaga to dostępność ośmiu nowszych patchy Expo. Projekt
  zachowuje obecne exact pins do osobnego, kontrolowanego okna aktualizacji.
