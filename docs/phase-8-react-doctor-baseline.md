# Faza 8: baseline React Doctor

## Status i zakres

Baseline wykonano **2026-07-23** na bieżącym drzewie roboczym frontendu przed
jakimikolwiek poprawkami Fazy 8. Bazowy commit repozytorium to `602b2edef86b`, ale wynik
obejmuje również aktywne, niezacommitowane zmiany modernizacyjne. Nie należy porównywać go
wyłącznie z tym commitem.

Skan obejmuje cały katalog `frontend`, a nie tylko pliki zmienione względem Git. Telemetria
i zewnętrzny score React Doctor zostały wyłączone. Źródłem porównania jest liczba i rodzaj
diagnostyk, wynik TypeScript/OxLint oraz rozmiar produkcyjnego buildu.

## Wersje narzędzi

| Narzędzie             | Wersja    |
| --------------------- | --------- |
| Node.js               | `26.8.1`  |
| PNPM                  | `11.25.0` |
| TypeScript            | `7.0.2`   |
| OxLint                | `1.75.0`  |
| React Doctor          | `0.9.1`   |
| React / React DOM     | `19.2.8`  |
| Vite                  | `8.1.5`   |
| React Compiler plugin | `1.0.0`   |

## Polecenia odtwarzające

```bash
cd frontend
npx -y react-doctor@0.9.1 . --verbose --no-telemetry

cd ..
pnpm --filter frontend-zglosto typecheck
pnpm exec oxlint frontend
pnpm --filter frontend-zglosto build
```

React Doctor celowo kończy się kodem `1`, ponieważ baseline zawiera diagnostyki o poziomie
`error`. TypeScript, OxLint i build kończą się kodem `0`.

## Wynik React Doctor

React Doctor zgłosił **99 surowych diagnostyk**: 4 błędy i 95 ostrzeżeń.

| Kategoria       | Błędy | Ostrzeżenia |  Razem |
| --------------- | ----: | ----------: | -----: |
| Bugs            |     1 |          14 |     15 |
| Performance     |     3 |          11 |     14 |
| Accessibility   |     0 |          20 |     20 |
| Maintainability |     0 |          50 |     50 |
| **Łącznie**     | **4** |      **95** | **99** |

Pięć pozycji jest raportowanych podwójnie dla tego samego miejsca przez reguły React Doctor
i reguły JSX accessibility. Po złączeniu identycznych tytułów i lokalizacji pozostają
94 pozycje. Oficjalnym baseline'em pozostaje jednak surowe `99`, ponieważ taki wynik zwraca
narzędzie.

Najliczniejsze reguły:

- 35 nieużywanych plików w `src/components/ui`;
- 6 synchronicznych aktualizacji stanu wewnątrz efektów;
- 5 zbędnych ręcznych memoizacji przy włączonym React Compiler;
- 8 zgłoszeń `label-has-associated-control`, z czego cztery są duplikatami między pluginami;
- 4 eksporty niekomponentowe w plikach komponentów;
- 3 komponenty większe niż 300 linii;
- 3 aktualizacje stanu po `await` w efektach bez ochrony przed nieaktualną odpowiedzią.

## Triage i priorytety kroku 2

### Priorytet 1: poprawność i accessibility używanej aplikacji

1. Zabezpieczyć trzy asynchroniczne efekty w `App.tsx` przed zapisem nieaktualnej odpowiedzi
   po zmianie roli, sesji albo unmount.
2. Uzupełnić dostępne nazwy kontrolek, powiązania `label`/`control` oraz jawne typy przycisków
   w `AdminIncidentDialog.tsx` i `AdminPanel.tsx`.
3. Usunąć kopiowanie `incidents` do lokalnego stanu przez efekt w `AdminPanel.tsx` albo
   zastąpić je jawnym modelem stanu edycji.
4. Zweryfikować przepływ `pendingSubmit` w `IncidentForm.tsx`, który przekazuje stan do
   rodzica przez efekt i może powodować dodatkowe renderowanie lub nieaktualne wywołanie.

Te pozycje są wysokiej pewności i dotyczą faktycznie używanych ścieżek aplikacji.

### Priorytet 2: React Compiler i podział odpowiedzialności

1. `App.tsx` (764 linie), `AdminPanel.tsx` (656 linii) i `IncidentForm.tsx` (381 linii)
   należy podzielić przed migracją routingu i warstwy danych.
2. React Compiler nie optymalizuje fragmentów `App.tsx` i `IncidentForm.tsx` zawierających
   `try/finally`. Nie jest to błąd TypeScript ani błąd produkcyjnego buildu, ale oznacza
   pominięcie automatycznej memoizacji tych komponentów.
3. Fetchowanie i zarządzanie stanem serwerowym powinny zostać wyprowadzone z `App.tsx`.
   Docelowym miejscem są loadery tras i hooki TanStack Query z późniejszych kroków Fazy 8.

### Priorytet 3: nieużywane wrappery UI

React Doctor wskazał 35 nieużywanych plików `components/ui`. W tej grupie znajdują się
również dwa błędy:

- niepełne sprzątanie subskrypcji w nieużywanym `carousel.tsx`;
- `Math.random()` podczas renderowania nieużywanego `sidebar.tsx`.

Nie naprawiamy ich teraz pojedynczo. Faza 8A najpierw zbuduje graf importów. Pliki faktycznie
nieosiągalne zostaną usunięte, a zachowane wrappery będą migrowane do shadcn/Base UI.

### Priorytet 4: ostrzeżenia zależne od migracji

Dynamiczny import `recharts`, ręczne memoizacje, eksporty wariantów komponentów, role
semantyczne oraz `transition-all` wymagają ponownej oceny wyłącznie w zachowanych
komponentach. Nie powinny blokować poprawy używanych widoków.

## TypeScript, OxLint i build

- TypeScript 7: **przechodzi**, zero błędów.
- OxLint: **przechodzi**, zero błędów i 23 ostrzeżenia.
- Produkcyjny build: **przechodzi**, 2086 przetworzonych modułów.
- Główny plik JavaScript: `616.59 kB`, gzip `187.77 kB`.
- Główny CSS: `89.63 kB`, gzip `15.02 kB`.
- Vite ostrzega, że główny chunk przekracza `500 kB`. Podział tras i lazy loading w Fazie 8
  mają stanowić właściwe rozwiązanie, zamiast podnoszenia limitu ostrzeżenia.

Ostrzeżeń OxLint i React Doctor nie należy sumować: część z nich opisuje te same miejsca.

## Reguła porównania

Po każdej partii poprawek React należy uruchomić:

```bash
npx -y react-doctor@0.9.1 . --scope changed --verbose --no-telemetry
pnpm --filter frontend-zglosto typecheck
pnpm exec oxlint frontend
pnpm --filter frontend-zglosto build
```

Zmiana nie może zwiększać liczby błędów React Doctor, błędów TypeScript ani błędów OxLint.
Po zakończeniu kroku 2 wykonujemy ponownie pełny skan całego frontendu i porównujemy go z
wartościami `4/95/99` zapisanymi w tym dokumencie.

## Wynik po kroku 2

Krok 2 zakończono **2026-07-23**. Pełny skan całego `frontend` zwraca teraz
**62 diagnostyki: 0 błędów i 62 ostrzeżenia** w 38 plikach. Oznacza to usunięcie wszystkich
czterech błędów i zmniejszenie łącznej liczby zgłoszeń o 37 względem baseline'u.

Najważniejsze wykonane zmiany:

- asynchroniczne pobieranie danych ma ochronę przed zapisem po unmount albo zmianie
  użytkownika, a mapowanie DTO i stan danych przeniesiono z `App.tsx` do typowanego hooka;
- usunięto lustrzany stan zgłoszeń w panelu administratora oraz przekazywanie wyniku
  formularza do rodzica przez efekt;
- `App`, panel administratora i formularz zgłoszenia podzielono na mniejsze odpowiedzialności;
- dialogi administratora i służby oczekują na zakończenie mutacji przed zamknięciem;
- istniejący URL zdjęcia rozwiązania nie jest już omyłkowo wysyłany ponownie jako Base64;
- uzupełniono etykiety kontrolek, jawne typy przycisków i natywną semantykę klikalnych kart;
- formularz zgłoszenia korzysta z reduktora zamiast grupy luźno powiązanych stanów;
- naprawiono sprzątanie obu subskrypcji karuzeli i niedeterministyczny render szkieletu
  sidebara.

Kontrole po zmianach:

- TypeScript 7: **przechodzi**, zero błędów;
- OxFmt: **przechodzi**;
- OxLint: **przechodzi**, zero błędów i 19 ostrzeżeń;
- produkcyjny build Vite: **przechodzi**, 2088 modułów;
- główny JS: `617.36 kB`, gzip `191.19 kB`;
- główny CSS: `87.73 kB`, gzip `14.65 kB`;
- test przeglądarkowy: główny widok i dostępny dialog zgłoszenia otwierają się poprawnie.

Pozostałe ostrzeżenia nie blokują kroku 2. Największą grupą nadal jest 35 nieosiągalnych
wrapperów `components/ui`, które mają zostać usunięte lub zachowane świadomie w Fazie 8A,
przed migracją z Radix do shadcn/Base UI. Ostrzeżenie Vite o głównym chunku powyżej
`500 kB` zostaje do rozwiązania przez routing i code splitting w dalszych krokach Fazy 8.

## Wynik po Fazie 8A

Po migracji używanych wrapperów do shadcn/Base UI i usunięciu nieosiągalnych komponentów
pełny React Doctor `0.9.1` wykonany **2026-07-24** zwraca:

- **0 błędów**;
- **0 ostrzeżeń**;
- **0 diagnostyk łącznie**.

W ten sposób zamknięto także 35 ostrzeżeń dotyczących nieużywanych plików oraz pozostałe
ostrzeżenia pochodzące z wrapperów, które nie należały do działającej aplikacji.
