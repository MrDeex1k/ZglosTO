# Faza 5.5–5.6 — konflikty, słaba sieć, bezpieczeństwo i prywatność

Data weryfikacji: 2026-08-21.

## Zaimplementowany kontrakt konfliktu

- tabela `incydenty` ma dodatnią kolumnę `revision bigint` z migracją `012`;
- kolejka służby zwraca rewizję każdego rekordu;
- status, weryfikacja i transfer służby wymagają silnego
  `If-Match: "incident-N"`;
- zapytanie `UPDATE` sprawdza atomowo identyfikator, zakres sesji i oczekiwaną
  rewizję, a po sukcesie zwiększa ją o jeden;
- brak rekordu w bieżącym zakresie daje `404`, istniejący rekord z inną rewizją
  daje ustrukturyzowane `409/CONFLICT`;
- aplikacja odświeża kolejkę po `409`, lecz nie wykonuje automatycznego retry i nie
  utrwala mutacji offline.

## Granice bezpieczeństwa i prywatności

- `serviceKey` nie jest parametrem klienta; pochodzi wyłącznie ze zweryfikowanej
  sesji Better Auth;
- dwa lokalne konta `roads` i `other` otrzymały rozłączne fixture; każde zobaczyło
  wyłącznie własny rekord;
- próba zmiany rekordu `roads` sesją `other` zakończyła się `404`;
- ponowienie zapisu z zużytą rewizją zakończyło się `409`, a brak `If-Match` — `400`;
- prywatne query są rozdzielone przez origin, `userId` i `serviceKey`;
- zmiana sesji/zakresu oraz wylogowanie usuwają prywatne query, cache obrazów i
  robocze media;
- logger przepuszcza tylko bezpieczną allowlistę pól i odrzuca cookie, e-mail,
  identyfikator zgłoszenia, `serviceKey` oraz body requestu;
- pasywny przegląd nie wykazał utrwalania prywatnych query ani danych służby w
  AsyncStorage; utrwalane pozostają tylko preferencje i publiczna konfiguracja.

## Automatyczne dowody

- kontrakty: parser dodatniej rewizji oraz ścisły format ETag;
- backend HTTP: dwa zakresy sesji, `400`, `404` i `409`;
- Mobile API: wysyłanie aktualnego `If-Match` dla obu mutacji;
- polityka Mobile: `409 -> conflict-refresh`, mutation retry wyłączone;
- cleanup, rozdzielne query keys oraz prywatność loggera.

## Aktywna macierz urządzeń

- Pixel 9 Android Emulator — kolejka, detal i widoczny konflikt `409` przeszły;
- iPhone 17 Pro, iOS 26.5 — kolejka, detal i widoczny konflikt `409` przeszły;
- fizyczny iPhone, iPad/iPadOS, starsze iOS i tablety Android — celowo poza tym
  checkpointem zgodnie z decyzją projektową.

iOS 26.5 izoluje loopback Simulatora od hosta. Test nie wystawiał Metro ani API do
LAN lub internetu: użyto prywatnego interfejsu mostu Simulatora, jednodniowego
lokalnego CA dodanego tylko do jego keychaina oraz HTTPS przed ograniczonym proxy.
Cloudflare Quick Tunnel nie był używany.

Słaba sieć jest obsługiwana przez istniejącą politykę z 5.3: akcje sieciowe są
blokowane przy stanie offline, awaria requestu pozostawia ekran i wymaga ręcznego
ponowienia, a reconnect odświeża query. Pełny test terenowy pozostaje w 5.9.
