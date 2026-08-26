# Design system frontendu — Faza 8, krok 15

## Status

Krok 15 został wdrożony 2026-07-24. Zachowano istniejący kierunek wizualny oraz
konfigurowalne tokeny White-Label, a szczegóły implementacyjne komponentów zamknięto za
lokalną warstwą wrapperów.

## Kontrakt

- Tailwind CSS 4 pobiera tokeny z `frontend/src/App.css` przez `@theme inline`.
- shadcn/ui używa stylu `base-nova`, TypeScriptu i zmiennych CSS.
- Base UI jest biblioteką prymitywów, ale może być importowane wyłącznie w
  `frontend/src/components/ui`.
- Komponenty biznesowe zależą od lokalnych wrapperów, nie od Base UI ani Radix UI.
- Radix UI nie jest zależnością, warstwą zgodności ani dozwolonym szczegółem
  implementacyjnym.

## Warstwy tokenów

Tokeny bazowe (`background`, `foreground`, `card`, `primary`, `secondary`, `muted`,
`accent`, `border`, `ring`) opisują powierzchnie i hierarchię interfejsu. Tokeny
`destructive`, `success` i `warning` opisują stan, a ich warianty `*-foreground`
zapewniają właściwy kolor treści.

Konfiguracja miejskiego White-Label nadal steruje tokenami `brand-primary`,
`brand-secondary` i `brand-accent`. Komponent nie powinien kodować koloru konkretnego
miasta ani używać palet `red-*`, `green-*` lub `amber-*` do reprezentowania stanu.
Neutralne narzędzia Tailwind pozostają dozwolone dla zwykłego układu i treści, jeśli nie
zastępują tokenu semantycznego.

## Egzekwowanie

`pnpm check:source` uruchamia politykę design systemu oraz jej negatywne fixture. Bramka
odrzuca:

- zależności, importy i zmienne CSS Radix UI;
- bezpośrednie importy Base UI poza `frontend/src/components/ui`;
- konfigurację shadcn inną niż `base-nova` z CSS variables;
- brak wymaganych tokenów i ich mapowania Tailwind;
- surowe kolory statusów `red-*`, `green-*` i `amber-*` w TSX.

Politykę realizują `scripts/check-frontend-design-system.sh` i
`scripts/test-frontend-design-system-policy.sh`.

## Granice kroku

Ten krok nie jest pełnym redesignem, nie zmienia struktury widoków i nie wprowadza
przełącznika motywu. Zachowuje kompatybilne tokeny wariantu ciemnego, aby późniejsze
wdrożenie motywu nie wymagało ponownej migracji komponentów.
