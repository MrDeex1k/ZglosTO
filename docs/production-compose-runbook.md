# Produkcyjny Docker Compose — runbook operatora

## Zakres i gwarancje

Docker Compose jest głównym profilem pierwszych wdrożeń ZgłosTO dla małych gmin i miast.
Jeden host uruchamia rdzeń aplikacji oraz wybrane moduły. Profil zapewnia powtarzalny build
ze źródeł, HTTPS, plikowe sekrety, trwałe dane, kontrolowany upgrade, backup, odtworzenie
i start po restarcie hosta. Nie zapewnia odporności na utratę całego hosta; wymagane RTO,
RPO, pojemność i zachowanie pod obciążeniem zostaną zmierzone w Fazie 12.

## Wymagania hosta

- Linux `amd64` albo `arm64`, Docker Engine z Compose v2, Node 26, PNPM i nftables;
- konto systemowe `zglosto`, którego członkostwo w grupie `docker` daje uprawnienia
  równoważne root i musi być ograniczone administracyjnie;
- checkout dokładnego, podpisanego lub świadomie zatwierdzonego tagu Git w
  `/opt/zglosto/current`;
- prywatne katalogi `/var/lib/zglosto-compose`, `/var/backups/zglosto` i
  `/etc/zglosto`, dostępne wyłącznie operatorowi;
- publiczny DNS dla domeny aplikacji i hosta `uploads.*` wskazujący ten sam serwer oraz
  certyfikat HTTPS obejmujący oba hosty Nginx.

Najpierw skopiuj `deploy/compose/compose-host.env.example` do
`/etc/zglosto/compose-host.env`, a `.env.production.example` do
`/etc/zglosto/production.env`. Sekrety tworzy się jako osobne pliki wskazane przez
`ZTO_SECRETS_DIR` i zmienne modułów. Plik konfiguracyjny nie może zawierać wartości
sekretów.

## Firewall i usługa systemowa

Przed pierwszym uruchomieniem zastosuj politykę z aktywnej sesji administracyjnej:

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

Po skopiowaniu `deploy/compose/zglosto-compose.service` do systemd wykonaj:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now zglosto-compose.service
```

Jednostka ma prywatny `/tmp`, ochronę kernela i systemu plików, pusty bounding set
capabilities oraz zapis wyłącznie do katalogów stanu i backupu.

## Pierwsza instalacja i aktualizacja

Na dokładnym tagu Git:

```bash
pnpm deps:install
pnpm release:production:static
pnpm build:production -- --version <tag-git>
PRODUCTION_ENV_FILE=/etc/zglosto/production.env \
  ./scripts/production-compose.sh verify-host
PRODUCTION_ENV_FILE=/etc/zglosto/production.env \
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

## Moduły

- Object Storage: `local` (domyślny RustFS) albo `external` (S3/R2);
- Redis: `disabled`, `local` albo `external`;
- observability: `disabled`, `local` albo `external`;
- LLM: `disabled`, `local` albo `external`.

Tryb `both` jest zabroniony. Zmiana trybu wymaga kompletnej konfiguracji i sekretów,
`validate`, a następnie standardowego `deploy`. Całe 54 kombinacje przechodzą statyczną
walidację; konkretna instalacja uruchamia dokładnie jedną kombinację.

## Backup, restore i certyfikaty

Automatyczne backupy trafiają domyślnie do `/var/backups/zglosto`; przechowywanych jest
siedem najnowszych katalogów. Ręczne operacje:

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
docker compose logs --since 15m
```

Lock operacji zawiera PID. Martwy lock jest usuwany automatycznie; aktywnego locka nie wolno
kasować ręcznie. `recover-current` odtwarza ostatnio promowany zestaw bez cofania bazy.
Awaria całego hosta wymaga nowego hosta, checkoutu tego samego tagu, builda dla jego
architektury oraz restore z zewnętrznie skopiowanego backupu.

## Bramki

- `pnpm release:production:static` — pełne testy projektu, buildy, 54 warianty i testy
  negatywne;
- `pnpm release:production:validate` — rzeczywiste obrazy, host, sekrety i render Compose;
- `PRODUCTION_GATE_RUNTIME=1 pnpm release:production:runtime` — wyłącznie na dedykowanym
  hoście akceptacyjnym: deploy, restart, smoke i backup;
- `PRODUCTION_GATE_RESTORE=1` rozszerza ostatnią bramkę o destrukcyjny test restore w oknie
  serwisowym.

Projekt nie używa GitHub-hosted runnera. Automatyzacja pozostaje lokalna, dopóki nie
powstanie rzeczywista infrastruktura self-hosted.
