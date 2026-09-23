# Produkcyjny Docker Compose — runbook operatora

Nie masz jeszcze wybranego środowiska? Zacznij od [wyboru wdrożenia](deployment-selection.md).

Przejdź kolejno przez przygotowanie hosta i konfiguracji, build, walidację, deploy,
odbiór oraz uruchomienie usługi systemowej. Polecenia wykonuj z katalogu
`/opt/zglosto/current` jako operator `zglosto`, chyba że przykład używa `sudo`.
To instrukcja dla docelowego hosta Linux, nie polecenie uruchomienia produkcji na laptopie.

> **Bramka przed publikacją:** obecny kod obsługuje `EMAIL_DELIVERY_MODE=disabled`
> oraz testowy outbox, ale nie ma gotowego produkcyjnego adaptera poczty. Zielone
> healthchecki nie potwierdzają wysyłki weryfikacji adresu ani resetu hasła.
> Integracja i odbiór dostarczania poczty pozostają warunkiem udostępnienia tych funkcji
> mieszkańcom. Nie ustawiaj `test` na produkcji. Zobacz
> [kontrakt konfiguracji poczty](environment-variables.md).

## Zakres i gwarancje

Docker Compose jest głównym profilem pierwszych wdrożeń ZgłosTO dla małych gmin i miast.
Jeden host uruchamia rdzeń aplikacji oraz wybrane moduły. Profil zapewnia powtarzalny build
ze źródeł, HTTPS, plikowe sekrety, trwałe dane, kontrolowany upgrade, backup, odtworzenie
i start po restarcie hosta. Nie zapewnia odporności na utratę całego hosta; wymagane RTO,
RPO, pojemność i zachowanie pod obciążeniem zostaną zmierzone w Fazie 12.

## Wymagania hosta

- Linux `amd64` albo `arm64`, Docker Engine z Compose v2 i Buildx, Bun `1.4.2`, `curl` i nftables;
- konto systemowe `zglosto`, którego członkostwo w grupie `docker` daje uprawnienia
  równoważne root i musi być ograniczone administracyjnie;
- checkout dokładnego, podpisanego lub świadomie zatwierdzonego tagu Git w
  `/opt/zglosto/current`;
- prywatne katalogi `/var/lib/zglosto-compose`, `/var/backups/zglosto` i
  `/etc/zglosto`, dostępne wyłącznie operatorowi;
- publiczny DNS dla domeny aplikacji i hosta `uploads.*` wskazujący ten sam serwer oraz
  certyfikat HTTPS obejmujący oba hosty Nginx.

Kontrakt builda wymaga minimum 2 CPU, 4 GiB RAM i 15 GB wolnego miejsca. Są to progi
walidatora builda, nie wyliczenie pojemności produkcji. Limity czasu buildów i pełne
wymagania znajdziesz w [kontrakcie obrazów](../deploy/production-source-build.json).
Docelową konfigurację sprzętu dobierz według
[pomiarów zasobów](phase-12-local-resource-sizing.md) i testów obciążeniowych.

Administrator przygotowuje konto operatora, checkout wydania oraz prywatne katalogi.
Poniższe polecenia zakładają, że konto `zglosto` i grupa `docker` już istnieją:

```bash
sudo install -d -o zglosto -g docker -m 0700 \
  /etc/zglosto /etc/zglosto/secrets \
  /var/lib/zglosto-compose /var/backups/zglosto
```

Nie uruchamiaj `bun` jako root. Operator musi mieć prawo budowania obrazów i zapisu
artefaktów w checkoutcie. Nie wykorzystuj hosta innego klienta ani jego wolumenów.

## Konfiguracja i sekrety przed buildem

Najpierw skopiuj `deploy/compose/compose-host.env.example` do
`/etc/zglosto/compose-host.env`, a `.env.production.example` do
`/etc/zglosto/production.env`. Sekrety tworzy się jako osobne pliki wskazane przez
`ZTO_SECRETS_DIR` i zmienne modułów. Plik konfiguracyjny nie może zawierać wartości
sekretów.

Przy pierwszej instalacji skopiuj szablony bez nadpisywania istniejących plików:

```bash
umask 077
test -f /etc/zglosto/compose-host.env || \
  cp deploy/compose/compose-host.env.example /etc/zglosto/compose-host.env
test -f /etc/zglosto/production.env || \
  cp .env.production.example /etc/zglosto/production.env
```

Edytuj pliki lokalnie na hoście. Nie publikuj ich ani renderu konfiguracji w logach CI.

| Plik / pole                                                           | Co przygotować                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `compose-host.env`                                                    | Ścieżki stanu, backupów i `production.env`, retencja oraz timeout. Czyta go systemd.      |
| `PUBLIC_BASE_URL`, `BETTER_AUTH_URL`, `FRONTEND_ORIGIN`               | Ten sam rzeczywisty adres HTTPS aplikacji; bez `example.invalid`.                         |
| `S3_PUBLIC_ENDPOINT`                                                  | Publiczny host uploadów objęty DNS i certyfikatem.                                        |
| `ZTO_SECRETS_DIR`                                                     | W tym przewodniku `/etc/zglosto/secrets`, nie developerski katalog.                       |
| `OBJECT_STORAGE_MODE`, `REDIS_MODE`, `OBSERVABILITY_MODE`, `LLM_MODE` | Dokładnie jeden wariant każdego modułu; wymagania opisano niżej.                          |
| YAML White-Label i materiały miasta                                   | Wersjonowane razem z wydaniem według [konfiguracji miasta](white-label-configuration.md). |

Przygotuj wszystkie pliki z [bazowej listy sekretów](../deploy/compose/required-secret-files.txt),
sekrety wybranych modułów oraz pliki wymagane przez finalny Compose. Lista bazowa nie
zastępuje kontroli całego renderu — np. TLS gatewaya ma dodatkowe pliki. Certyfikaty muszą
pasować do nazw usług i ról klientów opisanych w [TLS/mTLS](transport-security.md).
Nie używaj certyfikatów developerskich ani przykładowych haseł.

Katalogi prywatne powinny mieć uprawnienia `0700`, a pliki sekretów `0600` z właścicielem
pozwalającym operatorowi i Dockerowi odczytać je bez udostępniania innym użytkownikom.
Uzgodnij odnawianie certyfikatów i provisionowanie bucketu przed startem; ustawienie
`S3_AUTO_CREATE_BUCKET=false` nie tworzy magazynu automatycznie.

W sesji operatora ustaw te same ścieżki co w `compose-host.env`. Skrypt shellowy nie
wczytuje tego pliku automatycznie:

```bash
export PRODUCTION_ENV_FILE=/etc/zglosto/production.env
export PRODUCTION_STATE_DIR=/var/lib/zglosto-compose
export PRODUCTION_BACKUP_ROOT=/var/backups/zglosto
export PRODUCTION_BACKUP_RETENTION_COUNT=7
export PRODUCTION_WAIT_TIMEOUT_SECONDS=300
```

Powtórz te ustawienia w nowej sesji przed administracją. Nie trzymaj ścieżek nowego
kandydata na stałe w `compose-host.env`: po promocji systemd ma używać bieżącego wydania
z `/var/lib/zglosto-compose/current.*`.

## Firewall i usługa systemowa

Przed pierwszym uruchomieniem zastosuj politykę z aktywnej sesji administracyjnej:

Zastąp przykładowy CIDR rzeczywistym adresem administracyjnym i zapewnij niezależną
konsolę odzyskiwania. Zła reguła może odciąć SSH. Samo `nft --check` nie potwierdza,
że Twój adres został dopuszczony.

```bash
sudo ADMIN_SSH_IPV4_CIDR=203.0.113.10/32 \
  ./scripts/install-compose-firewall.sh
```

Instalator najpierw wykonuje `nft --check`. Polityka przyjmuje ruch istniejący, loopback
i ICMP, publikuje HTTPS oraz dopuszcza SSH wyłącznie ze wskazanego IPv4 CIDR. Łańcuch
forward pozostaje pod kontrolą Dockera; żaden kontener poza Nginx i lokalną Grafaną
na `127.0.0.1` nie publikuje portu hosta.

Lokalny RustFS pozostaje wyłącznie w prywatnej sieci Compose. Presigned uploady przechodzą
przez host `uploads.*` na tym samym publicznym porcie Nginx, który dopuszcza tylko `PUT`
i `OPTIONS`. PostgreSQL nie publikuje portu w profilu produkcyjnym; mapowanie developerskie
jest ograniczone do `127.0.0.1`.

Usługę systemd zainstaluj dopiero po pierwszym udanym `deploy` i odbiorze opisanym niżej.
Jej `ExecStart` wykonuje `up`, nie zastępuje budowania obrazów ani migracji pierwszego
wdrożenia.

## Pierwsza instalacja i aktualizacja

Najpierw sprawdź checkout. Tag musi już istnieć i wskazywać bieżący commit; YAML miasta
oraz nowe źródła dokumentacji muszą należeć do tego wydania. Build produkcyjny odrzuca
brudne drzewo, nieśledzone pliki i brak dokładnego tagu. Nie omijaj tych kontroli:

```bash
git status --short
git tag --points-at HEAD
bun --version
docker compose version
docker buildx version
```

Po przygotowaniu zatwierdzonego wydania zainstaluj zależności i wykonaj bramkę statyczną:

```bash
bun run deps:install
bun run release:production:static
```

Następnie zbuduj obrazy dla faktycznego tagu i pliku miasta. `TAG_WYDANIA` oraz
`PLIK_MIASTA` poniżej są znacznikami do zastąpienia, nie gotowymi wartościami:

```bash
bun run build:production --version TAG_WYDANIA --config config/white-label/PLIK_MIASTA.yaml
```

Powstają `.state/production-build/candidate/images.env` i `manifest.json`. Manifest
wiąże obrazy z rewizją Git, architekturą, wersją i checksumem YAML. Nie przepisuj ręcznie
tagów obrazów i nie używaj `latest`.

**Jawnie wybierz kandydata**, także przy kolejnej aktualizacji. Bez tych zmiennych
skrypt preferuje już promowane `current.images.env`, więc nowy build nie zostanie
automatycznie wybrany:

```bash
export PRODUCTION_IMAGES_ENV_FILE="$PWD/.state/production-build/candidate/images.env"
export PRODUCTION_BUILD_MANIFEST_FILE="$PWD/.state/production-build/candidate/manifest.json"
./scripts/production-compose.sh verify-host
./scripts/production-compose.sh validate
```

`verify-host` sprawdza podstawowe narzędzia i przygotowuje katalogi. `validate` sprawdza
obrazy lokalne, manifest, konfigurację, wymagane pliki i render Compose. Żadna z tych
kontroli nie zastępuje testu dostarczania poczty ani odtworzenia backupu.

Gdy oba kroki przejdą i masz uzgodnione okno utrzymaniowe:

```bash
./scripts/production-compose.sh deploy
```

`deploy` wykonuje kolejno:

1. walidację ośmiu lokalnych obrazów, manifestu, modułów, sekretów i Compose;
2. pobranie wyłącznie brakujących, przypiętych obrazów komponentów zewnętrznych;
3. obowiązkowy backup działającego wcześniejszego wydania (pomijany tylko przy pierwszej
   instalacji bez bazy);
4. migracje wyłącznie do przodu;
5. start z `--wait` i ograniczonym czasem oczekiwania;
6. smoke test publicznych tras HTTPS;
7. atomową promocję prywatnych plików bieżącego wydania;
8. usunięcie lokalnych obrazów ZgłosTO, które nie należą do aktywnego wydania.

Jeśli kandydat nie przejdzie startu albo smoke testu, skrypt odtwarza ostatnio promowane
obrazy i konfigurację. Migracji bazy nie cofa, dlatego każda migracja wydania musi być
kompatybilna wstecz z poprzednią aplikacją. Po udanej promocji nie przechowujemy obrazów
poprzedniej wersji; pełny rollback wymaga checkoutu jej tagu, ponownego builda i deployu.

Po sukcesie usuń wybór kandydata z bieżącej sesji, aby polecenia administracyjne
korzystały z promowanego wydania:

```bash
unset PRODUCTION_IMAGES_ENV_FILE PRODUCTION_BUILD_MANIFEST_FILE
./scripts/production-compose.sh status
./scripts/production-compose.sh smoke
```

Przy następnej aktualizacji powtórz cały etap od zatwierdzonego tagu i nowego builda.
Zaplanuj okno na obowiązkowy backup i zweryfikuj jego kopię poza hostem. Nie zmieniaj
jednocześnie tożsamości miasta, bazy i storage bez osobnego planu migracji.

## Odbiór aplikacji i dokumentacji

Zastąp adres poniżej właściwą domeną; nie wyłączaj weryfikacji TLS:

```bash
curl --fail --silent --show-error https://TWOJA_DOMENA/api/config/public
curl --fail --silent --show-error https://TWOJA_DOMENA/api/health/ready
curl --fail --silent --show-error --output /dev/null https://TWOJA_DOMENA/docs/
curl --fail --silent --show-error --output /dev/null https://TWOJA_DOMENA/docs/operacje/
curl --fail --silent --show-error --output /dev/null https://TWOJA_DOMENA/docs/pagefind/pagefind.js
```

Porównaj wersję i checksum konfiguracji z manifestem builda. Przez przeglądarkę sprawdź
logowanie, języki, role, anonimowe zgłoszenie, upload zdjęcia i pracę służby. Dostarczanie
poczty odbierz osobno; sam kod 200 dla sesji nie oznacza, że mieszkańcy mogą zweryfikować
adres lub odzyskać konto.

Dokumentacja jest częścią obrazu frontendu. Sprawdź przekierowanie `/docs` do `/docs/`,
wyszukiwanie, kopiowanie kodu, wersję Markdown oraz kod 404 dla nieistniejącej strony.
Z checkoutu możesz też wykonać kontrolę tras na rzeczywistym Nginx:

```bash
DOCS_TEST_ORIGIN=https://TWOJA_DOMENA bun run --filter docs-site check:build
```

Ta kontrola wymaga lokalnego `docs-site/dist` z tego samego wydania; najpierw wykonaj
`bun run check:docs`. Nie zmienia danych aplikacji. Zwykły `production-compose.sh smoke`
nie sprawdza `/docs` ani działania formularzy.

`PUBLIC_SITE_URL` odpowiada za absolutne adresy sitemap i indeksów AI. Przed
`bun run build:production` ustaw origin konkretnej instancji, np.
`export PUBLIC_SITE_URL=https://twoja-domena.pl`. Pipeline przekazuje go do obrazu
frontendu i odmawia buildu bez tej wartości; nie podmieniaj ręcznie promowanego obrazu.
Linki w interfejsie `/docs` pozostają same-origin.

## Start po restarcie hosta

Dopiero po pomyślnym deployu i odbiorze zainstaluj jednostkę. Jeśli już istnieje,
porównaj ją z szablonem zamiast nadpisywać lokalne ustawienia operatora:

```bash
sudo test -f /etc/systemd/system/zglosto-compose.service || \
  sudo install -o root -g root -m 0644 deploy/compose/zglosto-compose.service \
    /etc/systemd/system/zglosto-compose.service
sudo systemctl daemon-reload
sudo systemctl enable --now zglosto-compose.service
sudo systemctl status zglosto-compose.service --no-pager
```

Jednostka czyta `/etc/zglosto/compose-host.env`. Upewnij się, że wskazuje ten sam stan,
który został promowany podczas ręcznego deploya, bez trwałego wyboru kandydata. Ma
prywatny `/tmp`, ochronę kernela i systemu plików oraz zapis do katalogów stanu i backupu.
Niestandardowe katalogi wymagają dopasowania `ReadWritePaths`.

Przetestuj restart hosta w uzgodnionym oknie i ponownie wykonaj odbiór. Status
`active (exited)` jest normalny dla jednostki `oneshot` i sam nie potwierdza zdrowia
kontenerów — sprawdź wrapper `status`, `smoke` oraz zgłoszenie testowe.

## Moduły

- Object Storage: `local` (domyślny RustFS) albo `external` (S3/R2);
- Redis: `disabled`, `local` albo `external`;
- observability: `disabled`, `local` albo `external`;
- LLM: `disabled`, `local` albo `external`.

Tryb `both` jest zabroniony. Zmiana trybu wymaga kompletnej konfiguracji i sekretów,
`validate`, a następnie standardowego `deploy`. Całe 54 kombinacje przechodzą statyczną
walidację; konkretna instalacja uruchamia dokładnie jedną kombinację.

## Backup, restore i certyfikaty

Automatyczne backupy przed deployem trafiają w tym profilu do `/var/backups/zglosto`;
przechowywanych jest siedem najnowszych katalogów automatycznych. To nie jest harmonogram
regularnych kopii poza hostem — operator musi go zapewnić osobno. Ręczne operacje:

Polecenia zakładają ustawione ścieżki operatora i brak wyboru kandydata w sesji.
Zastąp `YYYYMMDD` rzeczywistym, unikalnym oznaczeniem. Restore zastępuje bieżące dane;
wykonuj je tylko po potwierdzeniu źródła kopii i okna utrzymaniowego, najpierw na
izolowanym środowisku odbiorowym.

```bash
./scripts/production-compose.sh backup /var/backups/zglosto/manual-YYYYMMDD
ALLOW_PRODUCTION_RESTORE=1 \
  ./scripts/production-compose.sh restore /var/backups/zglosto/manual-YYYYMMDD
./scripts/production-compose.sh rotate-certs
```

Restore jest operacją okna serwisowego: weryfikuje sumy kontrolne, zatrzymuje publiczny
ruch, odtwarza PostgreSQL i aktywny provider S3, uruchamia usługi oraz audytuje spójność
obiektów. Certyfikaty i klucze należy najpierw wymienić atomowo na hoście, a dopiero potem
wykonać `rotate-certs`.

## Diagnostyka i odzyskiwanie

```bash
./scripts/production-compose.sh status
./scripts/production-compose.sh smoke
./scripts/production-compose.sh recover-current
```

Lock operacji zawiera PID. Martwy lock jest usuwany automatycznie; aktywnego locka nie wolno
kasować ręcznie. `recover-current` odtwarza ostatnio promowany zestaw bez cofania bazy.
Awaria całego hosta wymaga nowego hosta, checkoutu tego samego tagu, builda dla jego
architektury oraz restore z zewnętrznie skopiowanego backupu.

Nie używaj zwykłego `docker compose logs` z katalogu repozytorium do diagnozowania
produkcji: bez plików i ENV wrappera może wskazać projekt developerski. Dla usługi
systemowej użyj `journalctl -u zglosto-compose.service`; status kontenerów pobieraj
przez wrapper z ustawionymi wyżej ścieżkami.

## Bramki

- `bun run release:production:static` — pełne testy projektu, buildy, 54 warianty i testy
  negatywne;
- `bun run release:production:validate` — rzeczywiste obrazy, host, sekrety i render Compose;
- `PRODUCTION_GATE_RUNTIME=1 bun run release:production:runtime` — wyłącznie na dedykowanym
  hoście akceptacyjnym: deploy, restart, smoke i backup;
- `PRODUCTION_GATE_RESTORE=1` rozszerza ostatnią bramkę o destrukcyjny test restore w oknie
  serwisowym.

Projekt nie używa GitHub-hosted runnera. Automatyzacja pozostaje lokalna, dopóki nie
powstanie rzeczywista infrastruktura self-hosted.

`bun run check:docs` jest osobną bramką dokumentacji, włączoną w `bun run check`, a przez to
również w `release:production:static`. Nie wykonuje deploya, migracji, backupu ani restore.
