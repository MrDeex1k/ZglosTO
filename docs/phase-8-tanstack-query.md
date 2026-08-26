# Faza 8: TanStack Query

**Status:** wdrożone 2026-07-24  
**Wersja:** `@tanstack/react-query@5.101.4` (dokładnie przypięta)

## Zakres

TanStack Query jest standardową warstwą stanu serwerowego frontendu. Zastępuje ręczne
`useEffect`, lokalne kopie odpowiedzi API oraz ręczne aktualizowanie tablic incydentów.

Wdrożenie obejmuje:

- jeden `QueryClient` tworzony dla każdej instancji TanStack Router;
- `QueryClientProvider` na granicy root route;
- domyślne `staleTime` 30 sekund, `gcTime` 10 minut i jedną próbę ponowienia zapytania;
- brak automatycznego ponawiania mutacji, aby operacja zapisu nie została wykonana dwa razy;
- centralne, typowane klucze i query options dla:
  - publicznych rozwiązanych incydentów,
  - incydentów mieszkańca,
  - wszystkich incydentów administratora,
  - incydentów przypisanych do służby;
- mutacje dla tworzenia zgłoszenia, zmiany statusu i weryfikacji, przypisania służby,
  przesłania zdjęcia rozwiązania oraz nadawania uprawnień użytkownikowi;
- natychmiastową aktualizację aktywnego cache po mutacji i następującą po niej
  invalidację całej domeny incydentów;
- `ensureQueryData` w loaderze strony głównej oraz loaderach paneli mieszkańca,
  administratora i służby;
- kontrolę sesji i roli w `beforeLoad` przed uruchomieniem prywatnego query;
- wspólny komponent błędu loadera z zachowaniem App Shell i ponowieniem przez
  `router.invalidate()`;
- jedenaście testów warstwy Query oraz dodatkowe testy kolejności guardu i wyboru
  prywatnego klucza; łącznie monorepo wykonuje 195 testów.

## Izolacja i bezpieczeństwo sesji

Publiczne i prywatne dane mają osobne przestrzenie kluczy. Każdy prywatny klucz zawiera
adres e-mail właściciela bieżącej sesji, dlatego cache dwóch kont nie jest współdzielony.
Po wylogowaniu cała prywatna przestrzeń cache jest usuwana. Publiczne rozwiązane
incydenty mogą pozostać w pamięci, ponieważ nie zawierają adresu zgłaszającego.

NestJS pozostaje źródłem prawdy i nadal wymusza autoryzację po stronie serwera.
Klucze Query służą izolacji interfejsu oraz poprawności cache, a nie zastępują kontroli
dostępu API.

## Prefetching w loaderach — krok 11

Krok 11 wdrożono 2026-07-24. `QueryClient` jest częścią typowanego kontekstu routera,
a każdy loader używa dokładnie tych samych fabryk `queryOptions` co późniejszy `useQuery`.
Pomyślny loader wypełnia cache przed renderem i subskrypcja komponentu nie wykonuje
drugiego requestu dla świeżych danych.

Cała gałąź `_app` ma jawne `ssr: false`, zgodnie z zaakceptowanym obecnym trybem SPA.
Loadery i `beforeLoad` tej gałęzi wykonują się wyłącznie w przeglądarce, dzięki czemu
same-origin `/api` pozostaje właściwym transportem i build/prerender nie próbuje pobierać
danych domenowych.

Kolejność prywatnej trasy jest jednoznaczna:

1. nadrzędny `beforeLoad` weryfikuje sesję;
2. `beforeLoad` panelu weryfikuje dokładną rolę;
3. loader buduje klucz zawierający właściciela sesji i wykonuje `ensureQueryData`;
4. komponent korzysta z istniejącego `useQuery`.

Loader nie pobiera danych bezpośrednio do własnego stanu i nie przekazuje listy jako
alternatywnego cache. Nie dodano server functions ani bezpośredniego połączenia z NestJS,
PostgreSQL lub Object Storage poza istniejącym klientem same-origin API.

## Granice wdrożenia

Krok 9 dotyczący TanStack Table zamknięto 2026-07-24 bez wdrożenia: bieżące widoki kart
nie wymagają silnika tabel. W kroku 10 wdrożono TanStack Form z Zod jako wspólny standard
wszystkich formularzy zapisujących dane użytkownika. Krok 11 domknął integrację Router
z Query; integracja szerszego publicznego kontraktu White-Label pozostaje krokiem 13.

Pakiet zweryfikowano przed instalacją: wersja `5.101.4` była stabilna i opublikowana
ponad 48 godzin wcześniej. Instalację wykonano przez Socket Firewall.
