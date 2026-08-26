# Weryfikacja kroku 3.1 — publiczny feed i szczegóły

Data wykonania: 2026-08-20.

## Zakres wdrożenia

Krok 3.1 dostarcza pierwszy publiczny pionowy przepływ Fazy 3:

- pobranie `GET /api/mieszkaniec/incydenty/glowna` przez wspólnego klienta API;
- walidację odpowiedzi parserem `@zglosto/contracts`;
- osobny query key i cache TanStack Query z anulowaniem przez `AbortSignal`;
- natywną, wirtualizowaną listę `FlatList` z loading, empty, error, retry i pull-to-refresh;
- karty zgłoszeń z usługą, adresem i datą rozwiązania;
- trasę Expo Router `/incidents/[id]` i ekran szczegółów;
- nazwę usługi z publicznej konfiguracji White-Label;
- otwieranie trasy w natywnej aplikacji map z fallbackiem do HTTPS;
- publiczne zdjęcie rozwiązania przez `expo-image` albo jawny stan braku zdjęcia;
- tłumaczenia polskie i angielskie oraz bezpieczne obszary iOS/Android.

Backend nie udostępnia osobnego publicznego endpointu szczegółów. Ekran szczegółów
korzysta z tego samego, współdzielonego query feedu i wybiera rekord po ID.
Bezpośrednie wejście w trasę nadal najpierw pobiera i waliduje publiczny feed.

## Środowisko testowe

- API: lokalne kontenery przez ograniczony Cloudflare Quick Tunnel;
- origin: `https://mentioned-nelson-bold-comparative.trycloudflare.com`;
- proxy dopuszcza wyłącznie publiczną konfigurację, feed oraz publiczne obrazy;
- trasy auth i metody zapisu zwracają `404` na warstwie tunelu;
- trzy deterministyczne, lokalne zgłoszenia `resolved` dodano do kontenerowej bazy;
- ID scenariusza szczegółów: `00000000-0000-4000-8000-000000000031`.

Adres Quick Tunnel jest tymczasowy i działa tylko podczas procesu `cloudflared`.

## Wyniki automatyczne

| Kontrola                  | Wynik                                       |
| ------------------------- | ------------------------------------------- |
| Mobile lint               | zaliczony, 0 ostrzeżeń                      |
| Mobile TypeScript         | zaliczony                                   |
| Mobile Vitest             | 9 plików, 34/34 testy                       |
| test kontraktu feedu      | sukces i odrzucenie niepoprawnej odpowiedzi |
| Expo Doctor               | 21/21                                       |
| pełne `pnpm check`        | zaliczone, 12/12 buildów workspace          |
| iOS development build     | `Build Succeeded`, `expo-image` podłączony  |
| Android development build | `BUILD SUCCESSFUL`, `expo-image` podłączony |

React Doctor nie zgłasza błędów ani nowego ostrzeżenia z kroku 3.1. Pełny skan
pokazuje osiem istniejących ostrzeżeń utrzymaniowych Fazy 2: sześć przypadków
ręcznej memoizacji w kodzie zarządzanym przez React Compiler oraz dwa celowo
przygotowane komponenty UI (`Input`, `Label`), które zaczną być używane w formularzach.
Nie zmieniano ich w tym kroku, ponieważ wymagałoby to osobnego refaktoru fundamentu.

## Wyniki urządzeniowe

### iPhone Simulator

- urządzenie: iPhone 16 Pro, iOS 18.6;
- instalacja nowego development buildu: zaliczona;
- start, konfiguracja White-Label, HTTPS i publiczny feed: zaliczone;
- lista trzech zgłoszeń i bezpieczne obszary: zweryfikowane wizualnie;
- własny deep link `zglosto://` wyświetla systemowe potwierdzenie otwarcia aplikacji.

Pełne automatyczne przejście dialogu deep linku nie było możliwe bez nadania
terminalowi uprawnień Accessibility. Trasa została natomiast zbudowana w iOS,
a jej ten sam kod JavaScript i przepływ danych przeszedł na Androidzie.

### Android Emulator

- urządzenie: Pixel 9, Android 17 / API 37;
- instalacja nowego development buildu: zaliczona;
- start, konfiguracja White-Label, HTTPS i publiczny feed: zaliczone;
- lista trzech zgłoszeń: zweryfikowana wizualnie;
- deep link i ekran szczegółów: zaliczone;
- usługa, daty, adres, akcja mapy i stan braku zdjęcia: widoczne poprawnie.

Zgodnie z bieżącą polityką nie uruchamiano iPada ani urządzeń fizycznych.

## Obserwacje

Quick Tunnel utracił raz połączenie QUIC i sam je odtworzył. Aplikacja pokazała w
tym czasie kontrolowany stan błędu z retry, a po odzyskaniu tunelu oba emulatory
ponownie pobrały feed. To potwierdziło zachowanie błędu sieciowego, ale pokazuje też,
że Quick Tunnel jest narzędziem developerskim, nie stabilnym środowiskiem preview.

## Decyzja

Implementacja kroku 3.1 jest gotowa. Przed uznaniem całej Fazy 3 za zamkniętą
pozostają checkpointy auth, prywatnych danych i mediów. Przy kolejnym ręcznym teście
iOS należy zaakceptować jednorazowy dialog custom scheme i przejść kartę szczegółów.
