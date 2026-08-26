# Faza 7.1–7.3 — publikacja, White-Label i Quick Start

Data checkpointu: 2026-08-25.

## 7.1 — bezpieczeństwo publikacji

Dodano centralne formularze GitHub dla błędu, pomysłu i pytania. Każdy wskazuje obszar
produktu i blokuje umieszczanie podatności, sekretów oraz PII. Formularz bezpieczeństwa
kieruje do Private Vulnerability Reporting, a wspólny PR template zawiera kontrole Mobile.

`scripts/check-public-repository.ts` kontroluje bieżące pliki publiczne i historię Git bez
drukowania dopasowanej wartości. Odrzuca prywatne env, klucze, wygenerowane katalogi,
wysokiej pewności tokeny i kopie dokumentów governance w `Mobile/`. Potwierdza też, że
pakiet Mobile wskazuje główną licencję.

Nie utworzono `CODEOWNERS`: role w `OWNERS.tsv` pozostają `TBD`, więc przypisanie dowolnego
użytkownika byłoby niepopartą decyzją właścicielską.

## 7.2 — White-Label klienta

Istniejące syntetyczne konfiguracje Gdańska i Wrocławia są niezależnymi wariantami.
`scripts/check-mobile-client-configs.mjs` tworzy z każdego ten sam publiczny kontrakt, który
pobiera Mobile, sprawdza odfiltrowanie nieaktywnych usług, brak kluczy sugerujących sekret,
unikalne wersje/checksumy oraz bezpieczny domyślny `Mobile/.env.example`.

Proces przekazania danych przez klienta opisuje [CLIENT_CONFIGURATION.md](CLIENT_CONFIGURATION.md).

## 7.3 — Quick Start

`scripts/mobile-demo.sh` udostępnia `check`, `up`, `status`, `seed`, `ios`, `android`,
`down` i `clean`. Korzysta z izolowanego projektu Compose `zglosto-mobile-demo`, portu
`1236` oraz głównego `.env.example`; nie wymaga kopiowania przykładowych haseł do
śledzonego pliku.

Seed tworzy dokładnie trzy konta `demo.*@example.test` z losowymi hasłami. Credentials są
zapisywane z prawami `0600` w ignorowanym `.state/mobile-demo`, a cleanup jest ograniczony
do jawnej nazwy projektu i tego katalogu. Instrukcja znajduje się w
[QUICK_START.md](QUICK_START.md).

Pełny start na czystym klonie jest końcową bramką 7.9. W 7.3 obowiązkowo przechodzą
kontrole składni, wymagań, Compose, kontraktów White-Label i publikowalności repozytorium.

## Dowód wykonania 7.0–7.3

Lokalna próba od zera na OrbStack zakończyła się wynikiem `PASS`:

- obrazy wszystkich usług zbudowały się z aktualnego drzewa źródeł;
- 10/10 usług projektu `zglosto-mobile-demo` osiągnęło stan `healthy`;
- Nginx odpowiadał na `127.0.0.1:1236`, bez publikowania pozostałych portów na hosta;
- `/api/config/public` zwróciło wersjonowaną konfigurację, 64-znakowy checksum i sześć
  aktywnych usług;
- seed utworzył dokładnie trzy syntetyczne role, a plik credentials otrzymał prawa `0600`;
- równoległy projekt Compose używany przez WEB nie został zatrzymany ani nadpisany.

Próba wykryła i usunęła trzy problemy, których nie pokazał sam statyczny `compose config`:

1. obrazy rozdzielają budowę zależności workspace od konsumenta i ponownie wstrzykują
   artefakty po `build`, zgodnie z trybem `injectWorkspacePackages` pnpm;
2. profil demo resetuje stałą nazwę kontenera bazy, więc nie koliduje z innym projektem;
3. fixture jawnie rzutuje role na bazowy enum PostgreSQL.

Po zebraniu dowodów wykonano `mobile:demo:clean`; zasoby i poświadczenia demo zostały
usunięte. Niezależny, pełny test ze świeżego klona pozostaje bramką wydania 7.9.

Końcowe bramki: skan 964 plików i historii Git, dwa warianty White-Label, lint, typecheck,
testy, build całego monorepo, export Mobile Android/iOS oraz Expo Doctor 21/21 przeszły.
Pełny `pnpm check` zatrzymał się dopiero na znanym formatowaniu niezależnego
`frontend/src/lib/device.ts`; wszystkie wcześniejsze kontrole źródeł, w tym Fazy 7,
przeszły, a plik WEB nie został zmieniony.
