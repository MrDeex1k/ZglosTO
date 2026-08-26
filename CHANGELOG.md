# Changelog

Wszystkie istotne zmiany projektu są dokumentowane w tym pliku. Od wydania `1.0.0`
historia zmian jest budowana na podstawie komunikatów zgodnych z Conventional Commits.

## [1.0.0] - 2026-08-26

Pierwszy kompletny baseline źródłowy ZgłosTO, przygotowany jako początek nowej historii
repozytorium zgodnej z Conventional Commits.

### Dodano

- modularną aplikację White-Label dla jednego miasta na instalację, z językami polskim i
  angielskim;
- frontend TanStack Start z React, TanStack Query, TanStack Form, Zod, Tailwind CSS i
  komponentami shadcn/ui opartymi na Base UI;
- backend NestJS, usługę Authorization opartą na Hono i Better Auth oraz neutralny
  `llm_gateway`;
- PostgreSQL z PgBouncerem, RabbitMQ, neutralny Object Storage zgodny z S3 i lokalny
  wariant RustFS;
- asynchroniczny media worker konwertujący obrazy przez Sharp do WebP;
- opcjonalne profile Redis, obserwowalności i lokalnego Docker Model Runner;
- produkcyjny profil Docker Compose oraz opcjonalne profile K3s/Kubernetes;
- wspólne kontrakty TypeScript, konfigurację White-Label, rate limiting, telemetrykę i
  uwierzytelnianie usług;
- gotową aplikację React Native + Expo dla mieszkańców i służb, budowaną lokalnie przez
  klientów dla ich własnych instancji;
- Turborepo jako lokalny orkiestrator zadań całego monorepo;
- Husky i Commitlint wymuszające Conventional Commits dla nowych commitów.
- licencję PolyForm Internal Use 1.0.0, zasady współtworzenia, CLA, prywatne zgłaszanie
  podatności i szablon pull requesta.

### Bezpieczeństwo i operacje

- odseparowano sieci wewnętrzne, pozostawiając Nginx jako publiczną bramę;
- dodano mTLS pomiędzy usługami aplikacyjnymi i TLS dla połączeń z PostgreSQL;
- dodano healthchecki, zarządzanie sekretami, backup/restore, kontrolę zawartości źródeł i
  obrazów oraz modułowe bramki wydaniowe;
- zależności JavaScript są przypinane dokładnie i instalowane przez PNPM, Socket Firewall
  oraz 24-godzinną kwarantannę publikacji.

### Ograniczenia wydania źródłowego

- repozytorium nie zawiera centralnie podpisanych ani publikowanych buildów iOS/Android;
- każdy licencjonowany klient utrzymuje jedną instancję dla jednego miasta oraz odpowiada
  za domenę, ENV, sekrety, signing Mobile, opcjonalną publikację sklepową, monitoring,
  backup, test odtworzenia, aktualizacje i rollback;
- profile korzystające z zewnętrznych S3/R2, Redis, OTLP lub modeli LLM wymagają
  infrastruktury i konfiguracji konkretnego klienta;
- wydanie źródłowe nie stanowi certyfikacji żadnego hosta ani infrastruktury klienta.
