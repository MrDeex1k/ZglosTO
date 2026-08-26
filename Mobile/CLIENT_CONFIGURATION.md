# Konfiguracja Mobile dla klienta

Mobile nie zawiera zaszytej konfiguracji konkretnego miasta. Każde wdrożenie montuje jeden
wersjonowany plik z `config/white-label/`, a aplikacja pobiera jego bezpieczną reprezentację
z `GET /api/config/public`. Jedna instancja obsługuje jedno miasto, a każdy klient buduje
własny wariant wskazujący jego własny origin API. Kod pozostaje wspólny, bez wyboru miasta
w runtime i bez umieszczania sekretów w bundlu.

## Dane wymagane od klienta

Przed utworzeniem konfiguracji potrzebne są:

- stabilny `city.key` i wersja konfiguracji;
- nazwa, język domyślny, obsługiwane języki i strefa czasowa;
- logo, favicon oraz teksty alternatywne z potwierdzonymi prawami do użycia;
- kolory marki z zaakceptowanym kontrastem;
- syntetyczne lub zatwierdzone publiczne dane kontaktowe;
- teksty prawne i informacja o numerze alarmowym;
- lista służb, kolejność, fallback i przypisania pracowników;
- decyzje dotyczące mapy, klasyfikacji LLM i anonimowych zgłoszeń;
- docelowy HTTPS origin API oraz unikalne bundle ID/application ID klienta;
- domena linków aplikacji i dane sklepowe tylko wtedy, gdy klient wybiera te kanały.

Sekrety, tokeny, certyfikaty, dane mieszkańców i prywatne adresy infrastruktury nie mogą
trafić do YAML-a White-Label ani zmiennych `EXPO_PUBLIC_*`.

## Dodanie wariantu

1. Skopiuj wyłącznie strukturę jednego pliku `config/white-label/test-*.yaml`.
2. Użyj sztucznych domen `.example` na etapie demonstracyjnym.
3. Nadaj nowy `city.key` i `configVersion`; nie zmieniaj istniejącej wersji w miejscu.
4. Dodaj tylko publiczne dane i assety z udokumentowanym pochodzeniem.
5. Uruchom:

```bash
pnpm check:mobile-client-configs
pnpm test:white-label-builds
```

6. Sprawdź Mobile na Android Emulator i iPhone Simulator, jeśli zmiana dotyczy wyglądu,
   usług, języka lub danych kontaktowych.

## Warianty referencyjne

- `config/white-label/test-gdansk.yaml`;
- `config/white-label/test-wroclaw.yaml`.

Oba warianty są syntetyczne. Automatyczna kontrola buduje współdzielone kontrakty,
waliduje YAML, tworzy publiczną reprezentację konsumowaną przez Mobile, usuwa nieaktywne
usługi i odrzuca klucze sugerujące sekret. Nie są to konfiguracje prawdziwych klientów.

## Granica odpowiedzialności

Konfiguracja White-Label steruje publiczną tożsamością i katalogiem usług. Nie steruje
rolami użytkowników, sekretami, połączeniami z bazą, retencją, signingiem, kontami sklepów
ani polityką bezpieczeństwa. Te elementy należą do wdrożenia i wspólnych dokumentów w
katalogu głównym repozytorium.

Klient nie współdzieli instancji z innymi miastami. Jego backend, PostgreSQL, Object
Storage, konta, sekrety i buildy Mobile tworzą osobny zakres operacyjny.
