# Faza 5.7–5.9 — weryfikacja końcowa MVP służb

Data checkpointu: 2026-08-21.

Aktywna macierz urządzeń, zgodnie z ustalonym zakresem:

- Pixel 9 Android Emulator;
- iPhone 17 Pro Simulator, iOS 26.5.

Nie wykonywano testów na urządzeniu fizycznym, iPadzie ani starszym iOS.

## 5.7 — dostępność i ergonomia

Wspólne przyciski mają minimalną wysokość 56 jednostek layoutu, a pola wejściowe i
checkboxy 48. Filtry kolejki wystawiają semantykę radio/checked, wybór statusu jest
grupą radiową, potwierdzenie weryfikacji jest checkboxem, nagłówki i karta akcji
mają nazwy dostępności, a podglądy oraz postęp wysyłania zdjęcia nie są anonimowe
dla technologii asystujących.

Drzewo dostępności potwierdziło:

| Kontrola                  |             Android |               iOS |
| ------------------------- | ------------------: | ----------------: |
| Opcja statusu             | ok. 49 dp wysokości |   49 pt wysokości |
| Potwierdzenie weryfikacji | ok. 49 dp wysokości |   49 pt wysokości |
| Stan wybrany/zaznaczony   |      `checked=true` | wartość `checked` |

Automatyczne scenariusze semantyki, filtrów, detalu i dużych celów dotykowych
przeszły na obu symulatorach. Ręczny odsłuch pełnych komunikatów VoiceOver i
TalkBack pozostaje osobną bramką przed betą w Fazie 7; nie był symulowany przez
automatyzację.

## 5.8 — wydajność

Fixture LOAD-A zawierał dokładnie 200 rekordów zakresu `roads`: 100
`reported`, 60 `in_progress` i 40 `resolved`. Dwa wcześniejsze lokalne rekordy
powodowały widok 202 elementów i zostały jawnie wyłączone z oceny rozkładu fixture.
Po pomiarach wszystkie 200 rekordów LOAD-A usunięto.

### Wyniki

| Pomiar                                                   | Wynik                                                             | Bramka lokalna                             | Ocena |
| -------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------ | ----- |
| Android, zimny start już uwierzytelnionego panelu, debug | 5382 / 5634 / 5457 ms; mediana 5457 ms                            | mediana ≤ 6000 ms, maksimum ≤ 6500 ms      | PASS  |
| Android `gfxinfo`, 502 klatki                            | p50 18 ms, p95 21 ms, p99 22 ms; 0 klatek >32 ms                  | p95 ≤25 ms, p99 ≤32 ms, brak klatek ≥50 ms | PASS  |
| Android, mutacja statusu / weryfikacji                   | 61 / 54 ms w lokalnym środowisku                                  | ≤500 ms                                    | PASS  |
| Android, prywatny obraz                                  | +5299 KiB PSS po otwarciu                                         | przyrost <20 MiB                           | PASS  |
| iOS Release, pełny przebieg harnessu do kolejki          | 14,76 s pierwszy przebieg; 9,65 / 9,65 s po rozgrzaniu harnessu   | przebieg ustalony ≤11 s                    | PASS  |
| iOS Release, przewijanie listy                           | 94,55 → 121,38 → 130,52 MiB; przyrost drugiego przebiegu 9,14 MiB | brak liniowego, nieograniczonego wzrostu   | PASS  |
| iOS Release, prywatny obraz                              | 126,44 → 126,08 MiB                                               | brak utrwalonego przyrostu >20 MiB         | PASS  |

Androidowy licznik „janky” wyniósł 22,51% względem terminu ekranu 120 Hz, ale nie
odnotował missed-vsync ani długiej klatki. Automatyczne gesty Maestro generowały
wysoką latencję wejścia, dlatego decyzja opiera się też na percentylach czasu klatki,
a nie na samym zbiorczym procencie.

Xcode 26.5 zwrócił `Hitches is not supported on this platform` dla instrumentu
Animation Hitches na iOS Simulator. Nie traktujemy pustego śladu jako pomiaru.
Natywny pomiar hitches/FPS iOS na fizycznym iPhonie oraz pomiar Android Release na
fizycznym urządzeniu pozostają bramkami Fazy 7.

### Decyzja listy

Pozostajemy przy `FlatList`. Dla 202 elementów nie wystąpiły długie klatki ani
nieograniczony wzrost pamięci, więc migracja do FlashList zwiększałaby złożoność bez
potwierdzonego problemu. Lista otrzymała ograniczone paczki renderowania
(`initialNumToRender=8`, `maxToRenderPerBatch=8`, `windowSize=7`). Decyzję należy
otworzyć ponownie dopiero po regresji ustalonych progów na buildzie Release.

## 5.9 — E2E i checkpoint

Fixture akceptacyjny rozdzielał 12 rekordów `QUEUE-A` dla `roads` (5/4/3) oraz
3 rekordy `QUEUE-B` dla `other` (1/1/1). Był resetowany przed każdym systemem i
usunięty po teście.

Na obu urządzeniach przeszedł pełny scenariusz:

1. logowanie służby i kontrola liczników oraz filtrów;
2. potwierdzenie, że zakres `other` nie jest widoczny dla konta `roads`;
3. otwarcie szczegółu, zmiana statusu i potwierdzenie weryfikacji;
4. natywny wybór, wysłanie i wyświetlenie prywatnego zdjęcia rozwiązania;
5. wylogowanie oraz potwierdzenie usunięcia dostępu do kolejki i prywatnego widoku.

Scenariusze `404` poza zakresem, `409` dla starej rewizji, offline/reconnect oraz
brak automatycznego ponowienia mutacji zostały zaliczone w 5.5–5.6 i pozostają
częścią regresji Fazy 5.

## Decyzja checkpointu

Faza 5 otrzymuje wynik **PASS / CONTINUE**. MVP służb może przejść do następnej
fazy implementacyjnej. Wynik nie oznacza jeszcze gotowości sklepowej: testy
fizycznych urządzeń, ręczny odsłuch czytników ekranu i produkcyjne pomiary Release
pozostają bramkami przed betą/release.
