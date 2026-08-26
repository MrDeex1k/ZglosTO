# Faza 5.0 — baseline MVP służb

Data zamrożenia zakresu: 2026-08-21.

## Stan wejściowy

Faza 3.7 dostarczyła działający pionowy przepływ: rolę `sluzby`, kolejkę i
statystyki ograniczone przez `serviceKey`, filtry, szczegóły, zmianę statusu i
weryfikacji oraz zdjęcie rozwiązania. Faza 5 nie buduje tych elementów od zera;
domyka ich odporność, bezpieczeństwo, dostępność i wydajność.

## Zamrożony kontrakt roli i zakresu

- źródłem prawdy jest zweryfikowana sesja Better Auth;
- użytkownik służby musi mieć rolę `sluzby` i niepusty `serviceKey`;
- klient nie wysyła `serviceKey` jako sposobu wyboru zakresu — backend pobiera go z
  sesji i stosuje w każdym odczycie, zapisie oraz dostępie do prywatnego obrazu;
- konto mieszkańca otrzymuje `403`, sesja nieważna `401`, a rekord nieistniejący
  lub spoza zakresu `404` bez ujawnienia, która z tych sytuacji wystąpiła;
- query keys zawierają `userId`, `serviceKey` i origin; zakończenie sesji usuwa całą
  prywatną gałąź query oraz prywatne pliki.

## Kolejka i statusy

- statusy pozostają zgodne z `@zglosto/contracts`: `reported`, `in_progress`,
  `resolved`;
- filtry kolejki to `all` oraz dokładnie trzy statusy kontraktowe;
- istniejący backend i UI dopuszczają przejście z każdego statusu do każdego
  innego statusu, łącznie z ponownym otwarciem zgłoszenia;
- zmiana statusu, weryfikacji oraz dołączenie zdjęcia są mutacjami bez
  automatycznego retry i bez trwałej kolejki offline;
- po sukcesie odświeżane są kolejka i statystyki; po braku sieci decyzja o
  ponowieniu należy do użytkownika.

## Semantyka błędów

| Stan                         | Zachowanie MVP                                                         |
| ---------------------------- | ---------------------------------------------------------------------- |
| anulowanie requestu          | bez komunikatu o błędzie i bez retry                                   |
| network/timeout/429/5xx      | zachować ekran, pokazać błąd i zaoferować ręczne ponowienie            |
| `401`                        | wyczyścić sesję i prywatne dane, przejść do stanu anonimowego          |
| `403`                        | odświeżyć sesję; po zmianie roli lub zakresu opuścić panel służby      |
| `404`                        | uznać rekord za niedostępny, odświeżyć kolejkę i wrócić z detalu       |
| `409`                        | odświeżyć rekord i wymagać ponownej, świadomej decyzji użytkownika     |
| błąd kontraktu/pozostałe 4xx | nie ponawiać automatycznie; pokazać bezpieczny komunikat i correlation |

Klasyfikację zamraża `service-phase5-policy.ts`. Warstwa UI zacznie jej używać w
5.3 i 5.5.

## Jawna luka kontraktu konfliktów

Aktualny backend aktualizuje rekord po `incidentId + serviceKey`, ale nie przyjmuje
wersji, ETag ani `If-Match`. Może zwrócić `404` dla rekordu spoza zakresu, lecz nie
potrafi wykryć, że operator zapisał starszą wersję i zwrócić wiarygodnego `409`.

Krok 5.5 wymaga dodania wersji rekordu lub równoważnego warunku atomowego. Do tego
czasu aplikacja nie może deklarować ochrony przed utraconą aktualizacją. Nie wolno
zastępować jej lokalnym timestampem ani automatycznym powtarzaniem mutacji.

Rozwiązanie wdrożone w 5.5: `incydenty.revision`, ścisły `If-Match` i atomowy zapis
ograniczony przez `incidentId + serviceKey + revision`. Szczegóły i dowody zawiera
[PHASE_5_5_6_VERIFICATION.md](PHASE_5_5_6_VERIFICATION.md).

## Dane testowe i środowisko

- logiczne fixture opisuje `PHASE_5_TEST_DATA.tsv`;
- konta powstają wyłącznie w lokalnym `NODE_ENV=test`; hasło jest generowane dla
  przebiegu i nie trafia do repozytorium;
- `SVC-A/roads` jest operatorem podstawowym, `SVC-B/other` dowodzi izolacji, a
  `RES-A` weryfikuje odmowę dostępu;
- `QUEUE-A` ma 12 rekordów do E2E, `QUEUE-B` trzy rekordy negatywne;
- `LOAD-A` ma 200 rekordów i jest uruchamiany oddzielnie, aby pomiar nie mieszał
  się z testem funkcjonalnym.

## Metodyka wydajności

- najpierw pomiar istniejącej `FlatList`, dopiero potem decyzja o FlashList;
- mierzymy cold start panelu, czas pierwszej użytecznej listy, FPS przewijania i
  filtrowania, pamięć przed/po otwarciu obrazów oraz czas reakcji mutacji;
- pomiar jest wykonywany na Pixel 9 Android Emulator i iPhone 17 Pro z najnowszym
  dostępnym iOS; starsze iOS, iPad, tablety i sprzęt fizyczny są odroczone;
- progi akceptacji zostaną zapisane po pierwszym powtarzalnym pomiarze w 5.8, bez
  arbitralnego wybierania wartości w baseline.

## Scenariusz akceptacyjny Fazy 5

1. Zalogować `SVC-A` i potwierdzić rolę oraz `serviceKey=roads`.
2. Sprawdzić liczniki, filtry i 12 rekordów `QUEUE-A` bez rekordów `QUEUE-B`.
3. Otworzyć detal, zmienić status i weryfikację, potwierdzić listę/statystyki.
4. Wybrać zdjęcie rozwiązania, wykonać presigned upload i dołączyć `uploadId`.
5. Powtórzyć kontrolowane scenariusze offline, timeout, `404`, `409` i reconnect.
6. Zmienić rolę lub `serviceKey` aktywnej sesji i potwierdzić opuszczenie zakresu.
7. Wylogować i wykazać usunięcie query, obrazów oraz roboczych mediów.

## Kryteria wyjścia 5.0

- zakres 3.7 jest zinwentaryzowany bez dublowania implementacji;
- rola, zakres, statusy, filtry i semantyka błędów są jawne i testowalne;
- fixture funkcjonalny i wydajnościowy ma zdefiniowany rozkład;
- brak backendowego konfliktu `409` jest zapisany jako zależność, nie ukryty;
- macierz `PHASE_5_ACCEPTANCE.tsv` wskazuje stan każdego dalszego kroku;
- typecheck, testy Mobile, format i lint nie wykazują nowych błędów.
