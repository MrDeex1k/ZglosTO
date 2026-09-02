# Polityka zależności

## Reguły

Projekt stosuje dwie równoległe zasady:

1. bezpośrednie zależności aplikacyjne i developerskie są przypięte do dokładnych wersji;
2. wersja może wejść do aktualizacji dopiero co najmniej 24 godziny po publikacji w rejestrze.

Nie ma wyjątków omijających kwarantannę.

## JavaScript i TypeScript

`pnpm-workspace.yaml` ustawia:

```yaml
minimumReleaseAge: 1440
minimumReleaseAgeStrict: true
minimumReleaseAgeIgnoreMissingTime: false
```

Reguła obejmuje zależności bezpośrednie i tranzytywne. Brak czasu publikacji w metadanych rejestru powoduje błąd zamiast cichego pominięcia kontroli. Wszystkie specyfikatory w `dependencies` i `devDependencies` są dokładnymi wersjami, bez `^`, `~`, `>=` ani `*`.

`minimumReleaseAge` jest podawane w minutach, dlatego `1440` oznacza 24 godziny.
Aktualizację wykonujemy wersją PNPM zapisaną w `packageManager`, a następnie obowiązkowo uruchamiamy instalację z lockfile, lint, typecheck, testy i build.

## Socket Firewall

Socket Firewall (`sfw`) jest przypięty w głównych `devDependencies` i chroni operacje PNPM przed pakietami ocenionymi przez Socket jako ryzykowne. Projekt udostępnia trzy skrypty:

```bash
pnpm deps:install
pnpm deps:add -- <pakiet>
pnpm deps:update
```

Skrypty uruchamiają odpowiednio `sfw pnpm install`, `sfw pnpm add --save-exact` i
`sfw pnpm update --recursive --latest`. Aktualizacja obejmuje wszystkie pakiety workspace,
łącznie z dozwolonymi zmianami wersji głównej, a dodawane zależności są od razu przypinane
do dokładnej wersji.
Nie należy używać zwykłego `pnpm add` ani `pnpm update`, ponieważ omija to kontrolę SFW.
Na świeżym klonie pierwsze `pnpm install --frozen-lockfile` jedynie odtwarza przypięty lockfile
i instaluje lokalną binarkę SFW; kolejne operacje na zależnościach wykonujemy przez powyższe skrypty.

SFW i 24-godzinna kwarantanna pełnią różne funkcje: SFW ocenia ryzyko pakietu, natomiast
PNPM egzekwuje minimalny wiek publikacji. Instalacja musi przejść obie kontrole.

## Audyt wydaniowy

Surowy `pnpm audit --prod` pozostaje źródłem danych. Bramka `pnpm audit:release` odczytuje
pełny JSON audytu i blokuje każde advisory produkcyjne niezależnie od poziomu. Po aktualizacji
Expo/Metro z 2026-09-02 wcześniejszy wyjątek dla `image-size@1.2.1` nie jest już potrzebny;
jego dokument pozostaje wyłącznie historycznym zapisem decyzji dla kandydata 1.0.0.

Python, UV i osobny zestaw zależności `llm_service` zostały usunięte w Fazie 7 po przejściu
na Docker Model Runner. Obecnie wszystkie zależności aplikacyjne repozytorium podlegają jednej
polityce PNPM + SFW.

## Obsługa wydań wycofanych

Pakiet spełniający próg wieku nadal nie jest wybierany, jeśli rejestr oznacza go jako deprecated lub uszkodzony. Podczas wcześniejszej aktualizacji, gdy obowiązywał próg 48 godzin, PNPM 11.12.0 i 11.13.0 były oznaczone jako uszkodzone, a poprawka 11.13.1 nie spełniała jeszcze ówczesnej kwarantanny. Po przejściu na próg 24 godzin manager aktualizowano wyłącznie do niewycofanych wydań; obecnie jest to `11.25.0`.
