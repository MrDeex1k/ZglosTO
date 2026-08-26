# Faza 12 — plan certyfikacji produkcyjnej

## Status

Faza jest **aktywna**. Automatyzacja jest kompletna, a
[lokalny preflight](phase-12-local-evidence.md) przeszedł, ale certyfikacja ma status
`pending-reference-host`. Nie wolno oznaczyć fazy jako zakończonej bez dowodów
z natywnego Ubuntu Server, prawdziwego DNS/TLS, kopii poza hostem, restore drillu, testu
obciążeniowego i podpisu operatora.

Maszynowym źródłem prawdy jest
`deploy/phase-12-acceptance-contract.json`, a przykładowy komplet dowodów znajduje się
w `deploy/phase-12-evidence.example.json`.

Pierwotnie planowany test na osobnym hoście referencyjnym nie jest obecnie dostępny.
W zamian wykonano [lokalny pomiar CPU i RAM](phase-12-local-resource-sizing.md), który
ustala wstępne wymagania per konfiguracja. Wynik ma status
`local-measured-provisional`: pozwala dobrać pierwszy host, ale nie zastępuje walidacji
na rzeczywistym serwerze wdrożeniowym.

## Hosty

Docelowym środowiskiem walidacji pozostaje natywny Ubuntu Server `amd64/x86_64`.
Nie ma już jednego wymagania CPU/RAM dla wszystkich wariantów. Wstępne wymagania zależą
od modułów:

- bez lokalnego LLM i lokalnej obserwowalności: minimum `2 CPU / 4 GiB`, zalecane
  `4 CPU / 8 GiB`;
- lokalny DMR: minimum `8 CPU / 8 GiB`, zalecane `12 CPU / 12 GiB`;
- lokalna obserwowalność bez lokalnego DMR: minimum `4 CPU / 8 GiB`, zalecane
  `6 CPU / 12 GiB`;
- lokalny DMR i lokalna obserwowalność: minimum `12 CPU / 12 GiB`, zalecane
  `12 CPU / 16 GiB`;
- 100–150 GiB SSD;
- Docker Engine, Compose v2, systemd i nftables.

Szczegółowe wyniki i ograniczenia zawiera
[raport lokalnego sizingu](phase-12-local-resource-sizing.md).

32-bitowe x86 nie jest wspierane przez docelowy runtime. Windows `amd64` z Docker Desktop
i WSL2 jest profilem zgodności dla instalacji demonstracyjnej/testowej. Oficjalny Docker
Model Runner wspiera Windows, lecz systemd, nftables, ścieżki hosta i gwarancje restartu
różnią się od Ubuntu. Windows nie jest w tej fazie certyfikowany jako równoważny host
produkcyjny.

## Certyfikowane profile

| Profil        | Object Storage | Redis      | Observability | LLM                     |
| ------------- | -------------- | ---------- | ------------- | ----------------------- |
| `minimal`     | lokalny RustFS | `disabled` | `disabled`    | lokalny DMR, Gemma 3 1B |
| `recommended` | lokalny RustFS | `local`    | `disabled`    | `disabled`              |

Wszystkie 54 kombinacje nadal przechodzą walidację statyczną. Profile external otrzymują
certyfikację runtime dopiero po wskazaniu rzeczywistych S3/R2, Redis, OTLP albo
OpenAI-compatible LLM. Tryb obserwowalności `local` może być włączony diagnostycznie podczas
load testów, lecz nie zmienia definicji dwóch zatwierdzonych profili.

## Kroki wykonawcze

1. Zamrozić kontrakt hosta, profili, SLO, RPO/RTO i wymaganych dowodów.
2. Zainwentaryzować host oraz sprawdzić architekturę, CPU, RAM, dysk, Docker, Compose,
   DMR, systemd i nftables.
3. Na czystym tagu Git zbudować osiem obrazów, zweryfikować ich kontrakty i zainstalować
   profil od zera.
4. Powtórzyć instalację dla `minimal` i `recommended`; zewnętrzne integracje pozostawić
   warunkowe.
5. Przeprowadzić upgrade, błąd kandydata, odzyskanie bieżącego wydania, restart hosta,
   rotację certyfikatów i rebuild wcześniejszego tagu.
6. Przetestować PostgreSQL, pgBackRest, RabbitMQ/outbox, RustFS, Redis, backup, utratę danych
   i pełny restore.
7. Wymusić awarie Redis, RabbitMQ, workera, Object Storage, bazy, PgBouncera, Authorization,
   LLM i opcjonalnej telemetryki.
8. Potwierdzić publiczny TLS, wewnętrzny mTLS, TLS 1.3 do PgBouncera/PostgreSQL/RabbitMQ,
   odrzucenie plaintext, obcej CA, błędnego SAN i niedozwolonych tożsamości.
9. Zmierzyć publiczny odczyt, przyjmowanie zgłoszeń, kolejkę zdjęć, LLM i długi soak.
10. Na podstawie pomiarów dostroić PgBouncera, PostgreSQL, RabbitMQ, Sharp, limity
    kontenerów, cache i timeouty.
11. Potwierdzić retencję, alerty i korelację `metryka -> trace -> log` w diagnostycznym
    profilu observability.
12. Przeprowadzić instalację White-Label nowego miasta według
    [checklisty odbiorowej](phase-12-white-label-rollout.md).
13. Zebrać raporty, zmierzone RPO/RTO, kopię poza hostem i podpis operatora. Dopiero wtedy
    zmienić status fazy na `complete`.

## Początkowe budżety

- dostępność miesięczna: 99,5%;
- RPO: 24 godziny;
- RTO: 4 godziny;
- publiczny odczyt p95: 500 ms;
- pełna ścieżka pomocnika LLM: maksymalnie 7 s, w tym DMR 5 s;
- maksymalny błąd HTTP w load teście: 1%;
- 100 równoległych czytelników;
- 20 rozproszonych źródłowo zapisów zgłoszeń na minutę;
- próg autoskalowania workera: kolejna replika na każde kolejne 4 obrazy backlogu, ze
  stabilizacją scale-down `180 s` w K3s;
- maksymalnie 5 MiB na pojedynczy obraz;
- końcowy soak: 60 minut.

Wartości są progami startowymi. Raport może je obniżyć albo wykazać, że wybrany host nie
spełnia oczekiwań; nie wolno „dostrajać” bramki po teście wyłącznie po to, by ukryć regresję.
