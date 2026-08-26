# Stała informacja o numerze 112 — Faza 8, krok 16

## Status

Krok 16 został wdrożony 2026-07-24 i kończy Fazę 8.

Przed zamknięciem fazy usunięto również dwa ostatnie ostrzeżenia OxLint w Authorization:
logger ESM korzysta z natywnego `import.meta.dirname` dostępnego w Node 26 zamiast
lokalnych odpowiedników `__filename` i `__dirname`.

Na początku formularza dodawania zgłoszenia znajduje się stale widoczna informacja:

> ZgłosTO nie służy do obsługi sytuacji alarmowych. Jeśli występuje bezpośrednie
> zagrożenie życia, zdrowia, mienia lub bezpieczeństwa, zadzwoń pod numer 112.

## Kontrakt zachowania

- komunikat jest widoczny przed pierwszym polem formularza;
- nie zależy od dostępności, wyniku ani czasu odpowiedzi LLM;
- nie zawiera checkboxa, przycisku ani dodatkowego pytania;
- nie blokuje walidacji ani wysłania zgłoszenia;
- nie zastępuje późniejszego wyniku klasyfikacji LLM;
- korzysta z tokenów semantycznych `warning`;
- jest oznaczony jako dostępnościowa nota i ma opisowy nagłówek.

Tekst polski i równoważny tekst angielski należą do wspólnego pakietu
`@zglosto/i18n`. `useTranslation()` zapewnia natychmiastową aktualizację komunikatu po
zmianie języka. Test komponentu renderuje oba warianty i sprawdza brak interaktywnego
potwierdzenia.
