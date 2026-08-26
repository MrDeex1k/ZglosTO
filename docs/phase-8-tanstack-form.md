# Faza 8: TanStack Form i Zod

**Status:** wdrożone 2026-07-24  
**Wersje:** `@tanstack/react-form@1.33.2`, `zod@4.4.3` (dokładnie przypięte)

## Decyzja

Wszystkie formularze zapisujące dane użytkownika korzystają z TanStack Form i Zod.
Jednolity standard obejmuje również proste formularze logowania, ponieważ spójność
obsługi wartości, błędów, dostępności i stanu wysyłania ma w tym projekcie większą
wartość niż utrzymywanie dwóch sposobów budowania formularzy.

Podział odpowiedzialności:

- Zod definiuje i testuje walidację oraz normalizację wejścia;
- TanStack Form przechowuje wartości, błędy pól, `canSubmit`, reset i `isSubmitting`;
- TanStack Query wykonuje mutacje domenowe i invaliduje cache;
- Better Auth obsługuje własne operacje logowania i rejestracji;
- NestJS, authorization i Better Auth nadal ponownie walidują dane po stronie serwera.

Walidacja w przeglądarce poprawia UX, ale nigdy nie jest granicą bezpieczeństwa.

## Zmigrowane formularze

1. logowanie;
2. rejestracja wraz z wymaganymi zgodami;
3. tworzenie zgłoszenia anonimowego lub zalogowanego mieszkańca;
4. nadawanie roli użytkownikowi;
5. przypisywanie służby do konta;
6. przypisywanie nieprzydzielonego zgłoszenia do służby;
7. aktualizacja statusu przez administratora;
8. aktualizacja statusu, weryfikacji i zdjęcia rozwiązania przez służbę.

Nie dotyczy to przełącznika języka, ponieważ nie jest formularzem zapisującym dane
użytkownika.

## Kontrakty danych

Schematy znajdują się w `frontend/src/forms/schemas.ts`. Każdy formularz ma jawne
wartości początkowe; brak opcjonalnego obrazu jest reprezentowany przez `null`, a nie
`undefined`.

Schematy:

- normalizują adresy e-mail, nazwę i tekstowe dane przez `trim` podczas wysyłania;
- wykorzystują stabilne statusy z `@zglosto/contracts`;
- ograniczają role nadawane z panelu do mieszkańca i służby;
- sprawdzają usługę względem aktywnej listy White-Label;
- dopuszczają wyłącznie obrazy PNG i JPEG do 5 MiB, a większy plik jest odrzucany
  przed rozpoczęciem uploadu z komunikatem widocznym przy polu;
- wysyłają plik binarnie przez krótko ważny presigned PUT; JSON zgłoszenia zawiera tylko
  jednorazowy `uploadId`, nigdy Base64;
- odrzucają SVG i inne typy danych obrazowych przed mutacją.

TanStack Form pracuje na typie wejściowym Standard Schema. Zgodnie z dokumentacją
TanStack wynik Zod jest jawnie parsowany w `onSubmit`, aby zastosować transformacje
i przekazać do API typ wyjściowy.

## Dostępność i błędy

Wspólny komponent błędów pól:

- łączy komunikat z kontrolką przez `aria-describedby`;
- oznacza nieprawidłową kontrolkę przez `aria-invalid`;
- renderuje komunikaty w elemencie z `role="alert"`;
- nie interpretuje niezaufanego błędu bez zawężenia z `unknown`.

Błędy odpowiedzi serwera są prezentowane oddzielnie od błędów walidacji. Przycisk
zapisu jest blokowany podczas wysyłania, a TanStack Form chroni formularz przed
równoległym ponowieniem operacji. Pola pozostają edytowalne po nieudanej walidacji,
a ich błędy są ponownie sprawdzane i usuwane po poprawieniu wartości.

## Zależności i testy

Obie zależności były stabilne od ponad 48 godzin i zostały zainstalowane przez Socket
Firewall. Dodano 12 testów Vitest schematów logowania, rejestracji, zgłoszeń, obrazów,
ról, służb i statusów. Łącznie monorepo wykonuje 189 testów.
