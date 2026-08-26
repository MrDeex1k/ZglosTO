# Faza 4.1 — rejestracja i weryfikacja e-maila

Data weryfikacji: 2026-08-21.

## Dostarczony zakres

- natywny ekran rejestracji Expo Router poza katalogiem tras;
- walidacja imienia, e-maila, hasła i dwóch wymaganych zgód;
- rejestracja Better Auth z aktywną sesją mieszkańca;
- typowane mapowanie błędów konta, hasła i rate limitu;
- komunikat niezweryfikowanego adresu w panelu oraz resend;
- callback `zglosto://auth/email-verified` oparty na odświeżeniu sesji z serwera;
- lokalny tryb testowego outboxa bez zewnętrznego dostawcy poczty;
- minimalnie rozszerzona allowlista loopbackowego proxy i jej testy negatywne;
- polskie i angielskie tłumaczenia oraz dostępne pole checkbox.

## Kontrakt lokalny

Kontenery uruchomiono z:

```bash
docker --context orbstack compose \
  --file docker-compose.yml \
  --file docker-compose.redis.local.yml \
  --file Mobile/docker-compose.phase4.local.yml up -d
```

Nakładka działa tylko lokalnie. `NODE_ENV=test` oraz `EMAIL_DELIVERY_MODE=test`
włączają istniejący pamięciowy outbox autoryzacji. Proxy dopuściło rejestrację,
resend, weryfikację i odczyt outboxa; kontrolny endpoint admina zwrócił `404`.

Wynik kontraktu HTTP:

| Operacja                  | Wynik                                    |
| ------------------------- | ---------------------------------------- |
| rejestracja               | `200`                                    |
| lokalny outbox            | `200`                                    |
| resend                    | `200`                                    |
| weryfikacja               | `302` do `zglosto://auth/email-verified` |
| endpoint spoza allowlisty | `404`                                    |

## Weryfikacja urządzeń

### Android Emulator

Urządzenie: `sdk_gphone16k_arm64`, Android 17 / API 37.

Pełny przepływ przeszedł:

1. otwarcie rejestracji;
2. wpisanie danych i zaznaczenie obu zgód;
3. utworzenie konta oraz wejście do panelu mieszkańca;
4. widoczny komunikat nieweryfikowanego adresu;
5. resend i potwierdzenie wysłania;
6. serwerowa weryfikacja oraz callback aplikacji;
7. ekran sukcesu i panel bez komunikatu weryfikacyjnego.

### iPhone Simulator

Urządzenie: iPhone 16 Pro, iOS 18.6.

Potwierdzono finalny bundle, układ formularza w języku polskim oraz callback dla
sesji anonimowej. Pełne automatyczne wpisywanie formularza nie zostało wykonane,
ponieważ macOS odmówił procesowi testowemu uprawnienia Accessibility (`-25204`).
Nie dodano developerskiego obejścia ani trasy umożliwiającej wstrzyknięcie sesji.
Manualny pełny przebieg iOS pozostaje kontrolą przed betą, a nie blokadą kodu 4.1.

Nie uruchamiano iPada ani fizycznego iPhone'a.

## Bramki automatyczne

- Mobile: 24 pliki testowe, 86 testów — zaliczone;
- `pnpm check` — zaliczone, w tym eksport bundle Android/iOS;
- React Doctor — brak nowych problemów; pozostało 5 wcześniejszych ostrzeżeń o
  manualnej memoizacji w providerach;
- Expo Doctor — 20/21; jedyną pozycją jest wcześniejsza rozbieżność patchy ośmiu
  pakietów Expo SDK 57, bez wpływu na build i runtime tej fazy.

## Wynik

Implementacja 4.1 jest gotowa do dalszego rozwoju. Pełny manualny przebieg iOS,
wersjonowany zapis zgód oraz prawdziwy dostawca e-mail pozostają odpowiednio
bramkami przed betą lub wdrożeniem produkcyjnym.
