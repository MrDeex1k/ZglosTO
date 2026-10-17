# Aktualizacja SDK 58 i natywnego interfejsu

Stan na 17 października 2026 r. Aktualizacja obejmuje kod, lockfile, konfigurację
NativeWind oraz development buildy iOS i Androida.

## Wersje

| Element          | Wersja     |
| ---------------- | ---------- |
| Expo             | 58.0.14    |
| React Native     | 0.88.0     |
| React            | 19.3.0     |
| NativeWind       | 5.0.0-rc.0 |
| react-native-css | 3.1.0-rc.0 |
| Tailwind CSS     | 4.3.3      |
| Expo Router      | 58.0.23    |
| @expo/ui         | 58.0.20    |

React Native jest stabilny; NativeWind pozostaje w wersji RC. Pakiety Expo dobrano według
`bundledNativeModules.json` z zainstalowanego Expo 58.0.14. Obowiązuje dotychczasowa
polityka SFW i karencja 3 godzin, również dla zależności tranzytywnych.

Migracja NativeWind usuwa plugin Babel, konfigurację Tailwind 3 i bezpośrednią
zależność od `react-native-css-interop`. Style powstają przez Tailwind 4, PostCSS
i `withNativewind`. Jawne adaptery komponentów w `src/components/ui/native.tsx`
zachowują `className`, `contentContainerClassName`, typy refów i typy danych list.
Wysokości linii są proporcjami zamiast wartości z interpretacją poprzedniej wersji.

Root overrides przypinają React Native do wspólnej stabilnej wersji, Lightning CSS do
1.30.1 wymaganego przez tę wersję silnika CSS oraz stabilny React Compiler 1.0.0
zamiast starej, wycofanej wersji wskazanej przez zależność RC. Czysta instalacja
odtwarza graf bez dodatkowych kopii starszego React Native.

## Wdrożone elementy interfejsu

Inspiracją były MojeZegarki (SwiftUI) i MojSamochod (React Native). Wybrano elementy
pasujące do obecnych przepływów ZgłosTO:

- Natywne karty mieszkańca „Moje zgłoszenia” i „Konto”, z systemowymi ikonami na
  iOS i Androidzie. Adresy `/resident` i `/account`, ochrona ról i szczegóły
  zgłoszenia pozostają obsługiwane przez Expo Router.
- Systemowe menu wyboru języka oraz służby przez `@expo/ui`. Długie nazwy służb
  nie zajmują osobnych, stale widocznych wierszy formularza.
- Systemowy arkusz formularza na iOS; modal z nawigacją systemową na Androidzie.
  Formularz zachowuje przycisk „Anuluj”, walidację, obsługę zdjęć i stan wysyłania.
- Liquid Glass dla obszaru działań publicznego feedu na obsługiwanym iOS.
  Starszy iOS i Android używają nieprzezroczystej powierzchni.
- Uwzględnienie ograniczenia ruchu, ograniczenia przezroczystości i większego
  kontrastu. Preferencje są odświeżane po powrocie aplikacji; błąd odczytu wybiera
  zachowawcze ustawienia. Zmiana powierzchni nie montuje ponownie jej kontrolek.
- Haptyczne potwierdzenie dopiero po pomyślnym wysłaniu zgłoszenia.

## Anti-slop i poprawki typów

Wybrane reguły z [anti-slop](https://github.com/dmmulroy/anti-slop/tree/c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b)
są dołączone lokalnie, z licencją MIT i przypiętym commitem. Działają w istniejącym
Oxlint, bez dodawania drugiego silnika lintowania:

- `no-chained-type-assertions` w kodzie produkcyjnym;
- `no-widen-then-assert` i `no-reduce-accumulator-copy` w całym repozytorium;
- `require-safety-comment-for-type-assertion` w produkcyjnym kodzie Mobile;
- dodatkowo natywna reguła Oxlint `no-accumulating-spread`.

Fixture testów są zwolnione z reguł łańcuchów rzutowań i komentarzy bezpieczeństwa;
ich niepełne adaptery i celowo niepoprawne dane sprawdzają granice kontraktów.
Test integracyjny sprawdza rzeczywisty CLI Oxlint i wszystkie pięć zakazanych wzorców.

Usunięto zbędne rzutowania tras i odpowiedzi sieciowych. Trasy dynamiczne mają
typowane parametry. Wybór środowiska i MIME zwraca rozpoznany element listy.
Parser cache konfiguracji sprawdza teraz również `null`, prymitywy i tablice
zamiast traktować wynik `JSON.parse` jako poprawny obiekt; dodano regresje.
Testy inicjalizacji autoryzacji zachowują zarejestrowane callbacki przed czyszczeniem
historii mocków, które Vitest 5 włącza domyślnie. Kontrola workspace wykrywa stare
zainstalowane wersje Vitest i sprawdza override tylko dla rodziców obecnych w lockfile.

## Weryfikacja

- `bun run check`: dokumentacja, polityki repozytorium, Knip, formatowanie,
  Oxlint z anti-slop, TypeScript, testy, warianty White Label oraz buildy.
  Kontrole z 17 października przeprowadzono etapami po czystej instalacji, ograniczając
  równoległość zadań Turbo do jednego. TypeScript, lint, testy i buildy przeszły.
  Testy infrastruktury po przekroczeniu limitów na obciążonym hoście przeszły przy
  ponowieniu, bez zwiększania limitów czasu. Ich fixture używa teraz Bun wykonującego test.
- Testy Mobile: 31 plików, 145 testów; anti-slop: 6 testów.
- Eksport bundli produkcyjnych Androida i iOS oraz kompilacja obu aplikacji
  natywnych z 17 października zakończone powodzeniem (Android arm64 oraz symulator iOS arm64).
- Testy interfejsu z 6 października: iPhone 18 Pro (iOS 27), iPhone 12 (iOS 17.5) i emulator
  Pixel 9 (Android 17), z izolowanym backendem demo i syntetycznymi danymi.
  Sprawdzono feed, formularz i menu. Na wszystkich trzech urządzeniach potwierdzono
  logowanie i przełączanie kart mieszkańca; na iPhonie 12 również otwieranie
  szczegółów zgłoszenia poza paskiem kart i poprawną etykietę powrotu.
- Aktualizacja z 17 października zachowuje TypeScript 6.0.3 oraz AsyncStorage 2.2.0
  według macierzy Expo. `expo install --check` potwierdza zgodność. NativeWind 5 RC
  wymaga również zachowania zgodnego silnika CSS i Lightning CSS.
- React Doctor: 91/100, brak błędów; pozostaje jedno ostrzeżenie o rozmiarze istniejącego
  komponentu formularza. Expo Doctor potwierdził wersje i brak duplikatów;
  trzy kontrole oparte na `npm explain` nie zakończyły się poprawnie dla grafu Bun.
- Osobny `audit:release` pozostaje czerwony: tranzytywne `braces` i `node-forge`
  mają zgłoszone podatności bez opublikowanych poprawek według
  [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) i
  [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv).
  Aktualizacja nie wyłącza bramki audytu.

Obrazy i logi testów lokalnych są w `.state/reviews/sdk58-ui` i `/tmp/zglosto-*`.
Nie stanowią artefaktów wydania sklepowego.

## Odtworzenie środowiska

Użyj `bun run deps:install` z katalogu głównego. Przy migracji między głównymi
wersjami sprawdź faktyczne wersje w `node_modules`, ponieważ aktualizacja Bun
może pozostawić stare kopie w workspace. Czysta instalacja zatwierdzonego
lockfile usuwa ten problem.

Po zmianie SDK potrzebny jest nowy development build; wcześniejszy binarny klient
SDK 57 nie wystarcza. Katalogi natywne powstają przez CNG/prebuild. Konfiguracja
środowiska API musi być obecna także podczas uruchamiania Metro i eksportu.

Źródła migracji: [NativeWind 5](https://www.nativewind.dev/v5/guides/migrate-from-v4),
[Expo UI](https://docs.expo.dev/versions/latest/sdk/ui/),
[natywne karty Expo Router](https://docs.expo.dev/router/advanced/native-tabs/).
