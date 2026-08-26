# Kontrakt deep linków, Universal Links i Android App Links

Data: 2026-08-20

## Aktywne linki development

Development build obsługuje scheme `zglosto`. Dozwolone wejścia:

```text
zglosto://open/incidents/<uuid>?target=public
zglosto://open/incidents/<uuid>?target=resident
zglosto://open/incidents/<uuid>?target=service
zglosto://auth/email-verified
```

Expo może prezentować ten sam URL z trzema ukośnikami. Źródłem prawdy jest ścieżka
`/open/incidents/:id` lub `/auth/email-verified`, nie tekstowa postać separatora po
scheme.

`target` ma zamkniętą allowlistę. ID musi mieć format UUID. Aplikacja nie przyjmuje
`returnTo`, pełnego URL, tokenu sesji ani tokenu weryfikacji jako celu nawigacji.

Publiczny target otwiera publiczne szczegóły. Target mieszkańca lub służby:

1. czeka na znany stan sesji;
2. dla anonimowego użytkownika otwiera logowanie z serializowanym intentem
   `role:uuid`;
3. po logowaniu wraca do szczegółów tylko, gdy rola jest zgodna;
4. dla innej roli otwiera jej własny panel, bez ujawniania prywatnych danych.

## Weryfikacja e-maila

Link w wiadomości najpierw trafia do endpointu Better Auth. Dopiero po poprawnym
zużyciu tokenu backend przekierowuje na:

```text
https://<MOBILE_APP_LINK_HOST>/auth/email-verified
```

Token weryfikacji pozostaje w HTTPS request do Authorization i nie trafia do URL
aplikacji. Ekran mobilny odświeża sesję z SecureStore i kieruje do panelu wynikającego
ze zweryfikowanej roli. Bez aktywnej sesji proponuje ponowne logowanie.

W development callback może wskazywać `zglosto://auth/email-verified`, ponieważ
Authorization ma dokładny trusted origin `zglosto://`.

## Aktywacja domeny produkcyjnej

Projekt świadomie nie ma obecnie własnej domeny. Powiązania natywne pozostają
wyłączone, dopóki nie istnieje rzeczywisty host HTTPS. Po jego uzyskaniu:

1. ustawić `MOBILE_APP_LINK_HOST=app.example.pl` podczas prebuild/build;
2. opublikować bez redirectu i z `Content-Type: application/json`:
   - `https://app.example.pl/.well-known/apple-app-site-association`,
   - `https://app.example.pl/.well-known/assetlinks.json`;
3. uzupełnić Apple Team ID w
   `linking/apple-app-site-association.example.json`;
4. uzupełnić produkcyjny SHA-256 certyfikatu Android w
   `linking/assetlinks.example.json`;
5. ograniczyć ścieżki po stronie AASA do `/open/*` i
   `/auth/email-verified`;
6. dodać dokładny origin do Better Auth tylko wtedy, gdy różni się od istniejącego
   `frontendOrigin`;
7. przebudować binaria — zmiana associated domains/intent filters nie jest zmianą
   wyłącznie JS/OTA.

`MOBILE_APP_LINK_HOST` przyjmuje wyłącznie nazwę DNS bez scheme, portu, ścieżki,
wildcardu, localhosta ani adresu IP. Ustawienie błędnej wartości zatrzymuje build.

## Fallback web

Host obsługuje te same ścieżki również wtedy, gdy aplikacja nie jest zainstalowana.
Fallback nie może automatycznie przekazywać tokenów do custom scheme. Powinien:

- dla `/open/incidents/:id` pokazać publiczny szczegół lub bezpieczną stronę
  logowania i przycisk „Otwórz w aplikacji”;
- dla `/auth/email-verified` pokazać neutralny wynik oraz link do logowania web;
- nigdy nie ujawniać istnienia prywatnego incydentu przed autoryzacją;
- zachować zwykłą nawigację HTTPS, jeśli otwarcie aplikacji się nie powiedzie.

Fallback web i pliki `.well-known` są blockerem przed aktywowaniem zmiennej w
preview/production, nie blockerem lokalnego custom scheme.
