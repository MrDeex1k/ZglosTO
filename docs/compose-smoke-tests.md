# Smoke test startu Docker Compose

## Cel

Smoke test potwierdza, ze pelny zestaw uslug Compose buduje sie, uruchamia bez restartow, osiaga wymagane healthchecki i realizuje publiczny routing same-origin. Przeplywy biznesowe pokrywa osobny [zestaw integracyjny Fazy 0](phase-0-integration-tests.md).

## Uruchomienie

Wymagania:

- dzialajacy Docker z Docker Compose;
- `curl` na hoscie;
- lokalny plik `.env` wymagany przez bazowy Compose.

Uruchomienie:

```bash
./scripts/smoke-compose.sh
```

Skrypt konczy sie kodem `0` po sukcesie, a przy bledzie zwraca kod rozny od zera, status kontenerow oraz ostatnie logi.

## Izolacja

Test składa provider-neutralny `docker-compose.no-rustfs.yml`, lokalny
`docker-compose.rustfs.yml` oraz `docker-compose.smoke.yml` w osobnym projekcie
`zglosto-smoke`:

- publiczny Nginx: `127.0.0.1:11235`;
- PostgreSQL: `127.0.0.1:15432`;
- dane PostgreSQL, pgBackRest i cache LLM sa trzymane w `tmpfs`, a izolowany wolumen RustFS
  jest usuwany po teście;
- backend i authorization nie publikuja portow hosta;
- PgBouncer nie publikuje portu hosta, a aplikacje nie otrzymuja `DATABASE_DIRECT_URL`;
- RabbitMQ nie publikuje AMQPS na hoście, nie uruchamia management i używa izolowanego wolumenu;
- RustFS nie publikuje portów hosta, a backend nie otrzymuje `RUSTFS_*`;
- po tescie kontenery, sieci i wolumen RabbitMQ są automatycznie usuwane;
- lokalne wolumeny zwyklego srodowiska Compose nie sa montowane ani usuwane.

Domyslne porty mozna zmienic:

```bash
SMOKE_HTTP_PORT=21235 \
SMOKE_DATABASE_PORT=25432 \
./scripts/smoke-compose.sh
```

Aby pozostawic srodowisko do diagnostyki:

```bash
SMOKE_KEEP_RUNNING=1 ./scripts/smoke-compose.sh
```

## Lekki tryb LLM

Smoke test pozostawia `LLM_RUNTIME=disabled`; nie pobiera ani nie uruchamia Docker Model
Runner. Backend nie łączy się z runtime'em bezpośrednio: test uruchamia `llm_gateway`, który
zwraca ustandaryzowany fallback `disabled`.

Skrypt domyślnie używa wersjonowanego `.env.example`, a nie lokalnego `.env`. Inny plik można
wskazać jawnie przez `SMOKE_ENV_FILE`.

Test sprawdza, ze:

- proces gatewaya odpowiada;
- `/llm/health` zwraca `enabled: false`, `loaded: false` i `error: "model_disabled"`;
- brak modelu nie blokuje startu aplikacji;
- anonimowe zgloszenie zostaje zapisane z `classification: unknown`, `source: fallback` i `reason: disabled`.

Rzeczywista inferencja wariantow `municipal` i `emergency` nie nalezy do tego smoke testu.

## Kontrolowany zakres

Skrypt sprawdza:

1. `docker compose config` dla provider-neutralnego bazowego pliku bez RustFS oraz lokalnego
   wariantu smoke z RustFS;
2. build oraz `docker compose up --wait` z timeoutem;
3. stan `healthy` wymaganych uslug;
4. brak restartow kontenerow;
5. aplikacyjny `DATABASE_URL` wskazuje PgBouncera, a rzeczywiste zapytania potwierdzają TLS
   1.3 na odcinku przez pooler i na bezpośrednim `DATABASE_DIRECT_URL`;
6. backend i authorization nie otrzymuja `DATABASE_DIRECT_URL`;
7. PostgreSQL i PgBouncer odrzucają klientów plaintext, a wszystkie migracje są powtarzalne
   przez bezpośredni URL z `verify-full`;
8. rzeczywisty zapis, odczyt, sprawdzenie i usunięcie obiektu przez `S3ObjectStorage`;
9. health RabbitMQ, jedyny listener AMQPS `5671`, brak plaintext `5672`, brak listenera
   management `15672` oraz brak publikacji AMQPS na hoście;
10. osobny `media_worker` bez HTTP i publicznych portów, z dostępem tylko do PostgreSQL,
    RabbitMQ i neutralnego Object Storage oraz bez sekretów Authorization i `RUSTFS_*`;
11. brak publikacji portów `backend:3000`, dawnego `authorization:9955`, obecnego
    `authorization:9956`, `pgbouncer:6432` i RustFS;
12. `GET /` dla frontendu;
13. `GET /health` dla publicznego Nginx;
14. `GET /api/health` dla backendu, PostgreSQL, Object Storage i zwalidowanego White-Label configu;
15. wewnętrzne readiness Authorization przez dedykowanego klienta mTLS, z bazą i stanem configu;
16. wewnetrzny artefakt readiness frontendu z wersja i checksumem configu;
17. `GET /api/auth/get-session` dla routingu Better Auth;
18. `GET /llm/health` dla wylaczonego modelu;
19. kod `401` dla prywatnej listy mieszkanca bez sesji;
20. anonimowy zapis ze znormalizowanym e-mailem i strukturalnym fallbackiem LLM.

Smoke test potwierdza podstawową część ADR-029: mTLS backend/Nginx -> Authorization, TLS 1.3
na obu odcinkach PgBouncera oraz odrzucenie połączeń plaintext. Pełny test integracyjny
dodatkowo pokrywa obcą CA, błędny SAN, wygaśnięcie i niedozwolony workload. Odwołanie oraz
rotacja certyfikatów pozostają końcową bramką Fazy 12 w docelowej infrastrukturze.

Ten smoke test waliduje bazowy runtime lokalny, a nie produkcyjny profil Compose. Fazy 9 i 11
dodadzą osobny override bez lokalnego builda, z registry/digestami, secrets, HTTPS,
hardeningiem i automatyzacją hosta. Faza 12 uruchomi dla niego osobny smoke, restore drill,
test upgrade/rollback oraz scenariusz utraty hosta.

## Granica

Smoke test tworzy tylko jedno anonimowe zgloszenie w izolowanej bazie. Rejestracja, logowanie, potwierdzenie e-maila, przejecie anonimowej historii, role, zdjecia, zmiany statusu i wszystkie warianty odpowiedzi LLM sa celowo weryfikowane przez `scripts/test-phase0-integration.sh`.
