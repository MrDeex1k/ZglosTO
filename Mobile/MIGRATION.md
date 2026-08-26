# Ocena i rekomendacja migracji do React Native + Expo

## 1. Rekomendacja

**Wynik:** greenfieldowy klient React Native + Expo w obecnym monorepo.

**Pewność:** średnio wysoka dla architektury, średnia dla pełnego zakresu wydania.

**Decydujący powód:** istniejący produkt jest klientem webowym z dobrze wydzielonymi
kontraktami, i18n i White-Label, ale bez dostępnego klienta natywnego, którego ciągłość
binarną trzeba zachować. Największą wartością jest ponowne użycie kontraktów i backendu,
nie mechaniczne przeniesienie komponentów DOM.

**Granica decyzji:** rekomendacja pozostaje ważna, jeśli checkpoint potwierdzi transport
sesji Better Auth, prywatne obrazy, upload ze zdjęciem oraz role na iOS i Androidzie.
Nieudany checkpoint powinien zatrzymać skalowanie projektu i skierować pracę do
uzupełnienia kontraktu backendu, a nie do obchodzenia go w UI.

Odrzucone ścieżki:

- **brownfield** — nie ma zaobserwowanego hosta iOS/Android ani zainstalowanej bazy
  użytkowników natywnych, do której trzeba osadzać ekrany React Native;
- **greenfield z późniejszym osadzaniem w hostach** — brak hostów natywnych czyni
  fallback brownfield pozornym;
- **WebView jako aplikacja mobilna** — nie rozwiązuje ergonomii formularzy, storage
  sesji, aparatu, uploadu ani zachowania natywnej nawigacji;
- **Expo DOM jako główna warstwa UI** — zachowałoby zależności od DOM i utrudniło
  dostępność oraz wydajność na urządzeniach.

## 2. Dowody

### Inwentarz platform

| Platforma   | Klient                                              | Dostęp | Status dowodu                                                              |
| ----------- | --------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Web         | `frontend/`                                         | pełny  | observed                                                                   |
| iOS         | brak projektu w repozytorium                        | brak   | observed w zakresie tego workspace; istnienie zewnętrznego klienta unknown |
| iPadOS      | brak projektu w repozytorium                        | brak   | observed; platforma docelowa potwierdzona przez użytkownika                |
| Android     | brak projektu w repozytorium                        | brak   | observed w zakresie tego workspace; istnienie zewnętrznego klienta unknown |
| Backend/API | `backend/`, `authorization/`, `packages/contracts/` | pełny  | observed                                                                   |

Użytkownik wskazał React Native + Expo jako docelową technologię nowej aplikacji.
Nie zaobserwowano projektów Xcode, Gradle ani konfiguracji sklepów dla istniejącego
klienta mobilnego.

### Materiał repozytoryjny

- `pnpm-workspace.yaml:1-6` obejmuje web, backend, auth i pakiety współdzielone, ale
  jeszcze nie `Mobile`;
- `frontend/package.json:19-20` potwierdza użycie
  `@zglosto/contracts` i `@zglosto/i18n`;
- `frontend/src/app/route-views.tsx:8-106` rozdziela widoki publiczne, auth i trzy
  role;
- `docs/api-contracts-baseline.md:115-137` już definiuje docelowy transport sesji
  Expo;
- `docs/api-contracts-baseline.md:145-204` zamraża publiczne i chronione endpointy
  incydentów;
- `docs/api-contracts-baseline.md:260-264` definiuje publiczną konfigurację
  White-Label z ETag;
- `docs/target-white-label-architecture.md:181-210` wskazuje TanStack Query,
  White-Label i `@better-auth/expo` jako kierunek;
- `docs/roadmap-overview.md:128-135` wskazuje, że Faza 12 gotowości produkcyjnej
  oczekuje na dowód z hosta referencyjnego;
- `frontend/src/services/api.ts:40-176` pokazuje webowe zależności od cookies,
  `File` i `crypto.subtle`, które wymagają adapterów mobilnych.

### Mocne strony

- ścisłe kontrakty Zod i stabilne statusy/role;
- jeden publiczny edge HTTPS przez Nginx/Ingress;
- gotowy przepływ presigned upload zamiast przesyłania zdjęcia przez backend;
- i18n dla `pl-PL` i `en`;
- konfiguracja White-Label z allowlistą, wersją, checksum i ETag;
- TanStack Query już modeluje stan serwerowy;
- role są egzekwowane przez backend, nie tylko przez UI.

### Ograniczenia pokrycia

- nie potwierdzono istnienia zewnętrznych repozytoriów iOS/Android;
- pełne widoki runtime nie zostały odtworzone, bo lokalny backend i authorization nie
  były uruchomione; sprawdzono kod widoków oraz shell i stan błędu w przeglądarce;
- repozytorium nie zawiera metryk użycia ekranów, crash rate, release cadence ani
  analityki produktowej;
- nie ma uzgodnionej listy minimalnych wersji iOS/Android ani urządzeń docelowych.
- produkcyjny profil nie ma jeszcze końcowej certyfikacji na hoście referencyjnym;
  jest to blocker publicznego release mobile, ale nie prac lokalnych i checkpointu.

## 3. Założenia i blokery

### Założenia

- aplikacja ma obsługiwać iOS, iPadOS i Android z jednej bazy kodu;
- publiczny edge będzie dostępny przez poprawny HTTPS również z urządzeń;
- pierwsze wydanie zachowuje trzy role, ale kolejność dostarczania to:
  mieszkaniec, służby, admin;
- logowanie pozostaje e-mail + hasło;
- aplikacja nadal jest jednym wdrożeniem na jedno miasto;
- wersja web pozostaje aktywna podczas całego wdrożenia mobile.

### Blokery przed skalowaniem implementacji

1. Potwierdzić oficjalne API aktualnej wersji Better Auth i `@better-auth/expo`,
   konfigurację scheme/trusted origins oraz zachowanie wylogowania.
2. Udowodnić, że prywatne obrazy są pobierane z autoryzowanym nagłówkiem `Cookie`
   albo przez kontrolowany blob cache.
3. Udowodnić checksum SHA-256 i presigned PUT dla pliku z
   `expo-image-picker`/aparatu bez konwersji do base64.
4. Zdefiniować deep link dla weryfikacji e-maila i zachowanie po instalacji/bez
   instalacji aplikacji.
5. Ustalić minimalne wersje systemów, macierz urządzeń i wymagania dostępności.
6. Ustalić właścicieli pozycji z `OWNERS.tsv`.
7. Przed publicznym release zakończyć albo jawnie zastąpić bramkę referencyjnego
   hosta z Fazy 12.

## 4. Reprezentatywny checkpoint

Checkpoint kończy się jedną z decyzji: kontynuuj greenfield, uzupełnij kontrakt i
powtórz checkpoint albo zatrzymaj projekt. Nie jest automatycznie przedłużany.

### Przepływy

1. **Publiczna lista → szczegóły incydentu**
   - White-Label, język, lista rozwiązanych incydentów, zdjęcie, adres i otwarcie
     mapy;
   - stany loading, empty, error i retry;
   - natywna nawigacja i obsługa dużego tekstu.
2. **Logowanie → panel mieszkańca**
   - logowanie, SecureStore, odtworzenie sesji po restarcie, role, wylogowanie,
     `401/403`, historia zgłoszeń;
   - deep link powrotu po weryfikacji e-maila w wersji minimalnej.
3. **Zgłoszenie ze zdjęciem → obsługa przez służbę**
   - wybór/wykonanie zdjęcia, limit 5 MiB, checksum, presigned PUT, utworzenie
     zgłoszenia;
   - zalogowanie jako służba, filtrowanie, zmiana `checked`/statusu i dodanie
     zdjęcia rozwiązania.

### Kryteria akceptacji

- zachowanie, walidacja, statusy, błędy i dane odpowiadają kontraktowi web/API;
- iOS i Android przechodzą te same scenariusze na urządzeniach, nie tylko w web
  preview;
- sesja przeżywa zimny restart, a wylogowanie usuwa cookie i prywatny cache;
- prywatne zdjęcie nie jest dostępne bez sesji i działa z sesją;
- upload 5 MiB działa, plik ponad limit jest odrzucany przed wysłaniem;
- dostępność obejmuje screen reader, Dynamic Type/skalę fontu, kolejność focusu,
  kontrast, minimalny target i klawiaturę ekranową;
- zimny start, interakcje listy, pamięć i crash behavior mają zapisany baseline;
- development build, CI, wewnętrzna dystrybucja i observability działają;
- każda ścieżka ma niezależny przegląd i dowód urządzeniowy;
- po checkpointcie nie ma błędów React Doctor dla zmienionego kodu React.

### Dwa przebiegi

- **faithful pass:** zachować zachowanie, dane, walidację, dostępność i edge cases;
- **idiomatic pass:** uporządkować kompozycję ekranów, typed routes, feature
  boundaries, listy wirtualizowane i testy, następnie ponownie wykonać parytet.

### Budżet i właściciele

Budżet kalendarzowy i osobowy: `TBD` przez właściciela produktu i engineering lead.
Brak zaakceptowanego budżetu blokuje rozpoczęcie checkpointu. Właściciele są
wyszczególnieni w `OWNERS.tsv`.

## 5. Baseline i ROI

### Dostępne dane

- jedna implementacja web dla trzech ról;
- współdzielone kontrakty i i18n;
- brak zaobserwowanej równoległej implementacji natywnej;
- brak danych o kosztach, lead time, retencji mobile, użyciu aparatu i częstotliwości
  pracy terenowej służb.

### Co liczyć

- wzrost dostępności produktu na urządzeniach i jakość pracy terenowej;
- skrócenie zgłoszenia ze zdjęciem i obsługi przez służbę;
- koszt współdzielenia kontraktów/i18n;
- osobny koszt weryfikacji iOS i Android;
- buildy, sklepy, OTA, observability, support i bezpieczeństwo;
- utrzymanie web + mobile oraz granic natywnych;
- koszt admina, jeśli ma wejść do mobile.

Nie wolno zakładać oszczędności z „jednego kodu” bez zmierzenia osobnej weryfikacji
urządzeń i kosztu dualnego UI. ROI pozostaje `unknown`, dopóki właściciel produktu nie
dostarczy mierzalnego celu.

## 6. Następna decyzja

Product owner, mobile lead, backend/auth owner i release owner akceptują:

1. zakres trzech przepływów checkpointu;
2. minimalne systemy i urządzenia;
3. budżet;
4. kontrakt auth/deep links;
5. końcową decyzję na podstawie `PARITY_CHECKS.md` i dowodów z buildów.
