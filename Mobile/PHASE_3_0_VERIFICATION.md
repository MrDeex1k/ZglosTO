# Faza 3.0 — bramka środowiska HTTPS

Data: 2026-08-20

## Zakres

Zweryfikowano pobranie publicznej konfiguracji White-Label przez rzeczywisty HTTPS
na iOS i Androidzie. Test korzysta z tymczasowego Cloudflare Quick Tunnel.

Aktywna macierz testowa obejmuje wyłącznie iPhone Simulator i Android Emulator.
iPad oraz urządzenia fizyczne są testowane dopiero na wyraźne polecenie właściciela
projektu i nie blokują obecnej bramki.

Ze względów bezpieczeństwa tunel nie wskazuje bezpośrednio na cały lokalny Nginx.
Lokalny proxy na `127.0.0.1:18135` dopuszcza wyłącznie `GET` i `HEAD` dla
`/api/config/public`; pozostałe metody oraz ścieżki zwracają `404`. Auth, prywatne
API i media nie są na tym etapie publicznie dostępne.

## Środowisko

- Compose: profil podstawowy oraz `docker-compose.redis.local.yml`, ponieważ lokalny
  `.env` ustawia `REDIS_MODE=local`;
- lokalny edge: `http://127.0.0.1:1235`;
- tymczasowy origin Mobile:
  `https://mentioned-nelson-bold-comparative.trycloudflare.com`;
- konfiguracja klienta znajduje się w ignorowanym przez Git `Mobile/.env`;
- Metro: `localhost:8081`, Android połączony przez `adb reverse tcp:8081 tcp:8081`.

Quick Tunnel nie zapewnia trwałego hosta. Po ponownym uruchomieniu `cloudflared`
należy zaktualizować `Mobile/.env` i ponownie uruchomić Metro.

## Wyniki HTTP

| Kontrola                            | Wynik                                    |
| ----------------------------------- | ---------------------------------------- |
| lokalny `/api/config/public`        | `200`, poprawny kontrakt                 |
| HTTPS `/api/config/public`          | `200`, poprawny kontrakt                 |
| `ETag` i `If-None-Match`            | `304`                                    |
| `/api/auth/get-session` przez tunel | `404`, zgodnie z ograniczeniem proxy     |
| certyfikat urządzenia               | publicznie zaufany certyfikat Cloudflare |

## Macierz urządzeń

| Urządzenie              | System              | Wynik                                      |
| ----------------------- | ------------------- | ------------------------------------------ |
| iPhone 16 Pro Simulator | iOS 18.6            | build, instalacja, `source=remote`, online |
| Pixel 9 Emulator        | Android 17 / API 37 | `source=remote`, online                    |

Przed zmianą zakresu wykonano również udany test na iPad Pro 11-inch Simulator z
tym samym artefaktem i `source=remote`. Wynik pozostaje dowodem historycznym, ale
iPad nie należy do bieżącej macierzy. Fizyczne urządzenia nie były testowane.

## Bramki automatyczne

| Bramka             | Wynik               |
| ------------------ | ------------------- |
| Mobile lint        | zaliczony           |
| Mobile typecheck   | zaliczony           |
| Mobile test        | 8 plików, 32 testy  |
| Expo Doctor        | 21/21               |
| lokalny build iOS  | zaliczony, 0 błędów |
| pełne `pnpm check` | zaliczone           |

## Stan bramki

Warstwa publicznej konfiguracji HTTPS jest potwierdzona na iPhone Simulator i
Android Emulator. Techniczna bramka środowiska 3.0 jest zakończona dla aktualnie
zaakceptowanej macierzy. iPad, fizyczny iPhone i fizyczny Android są jawnie odroczone
do osobnego polecenia i nie są blockerami bieżących prac.

Ręczne kontrole VoiceOver i TalkBack pozostają osobnym zadaniem dostępności.

Pełnego Nginx nie należy wystawiać przez Quick Tunnel przed wdrożeniem jawnej
allowlisty Better Auth, scheme/callbacków mobilnych, ograniczonego CORS i
kontrolowanych danych testowych. To jest wejście do kolejnych kroków Fazy 3, a nie
obejście blockerów B-01–B-05.
