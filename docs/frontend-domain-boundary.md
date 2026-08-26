# Granica domenowa TanStack Start i NestJS

**Status:** wdrożona i egzekwowana od 2026-07-24  
**Faza:** 8, krok 12

## Decyzja

NestJS pozostaje jedynym API domenowym ZgłosTO. TanStack Start odpowiada za UI, routing,
guardy, przygotowanie cache TanStack Query i ewentualne cienkie operacje BFF. Frontend nie
łączy się bezpośrednio z PostgreSQL/PgBouncer, Object Storage/RustFS, RabbitMQ ani Docker
Model Runner.

Dozwolone granice frontendu:

- same-origin `/api` do NestJS;
- same-origin `/api/auth` do Authorization/Better Auth;
- publiczna, build-time część kontraktu White-Label;
- współdzielone pakiety kontraktów, i18n oraz publicznej konfiguracji;
- TanStack Router, Query i Form jako warstwa klienta.

Frontend nie importuje implementacji `backend`, `authorization`, `database`, `llm_gateway`,
PgBouncera, RabbitMQ ani RustFS. Nie otrzymuje `DATABASE_URL`, `DATABASE_DIRECT_URL`,
poświadczeń S3/RustFS, AMQP/RabbitMQ ani kluczy dostawcy storage.

## Server functions

TanStack Start technicznie umożliwia `createServerFn` i moduły server-only. W ZgłosTO nie
mogą one zawierać logiki domenowej ani zastępować NestJS.

Jeżeli w przyszłości pojawi się uzasadniona cienka warstwa BFF:

- kod server-only musi znajdować się wyłącznie w `frontend/src/server/bff`;
- może składać lub proxy'ować istniejące kontrakty HTTP;
- nie może importować sterownika bazy, ORM, SDK Object Storage ani klienta brokera;
- nie może posiadać tabel, zapytań SQL, kolejek, bucketów ani reguł autoryzacji domenowej;
- klient React Native/Expo nie może zależeć od tej funkcji.

Obecnie katalog BFF nie zawiera implementacji produkcyjnych; polityka jedynie rezerwuje
kontrolowane miejsce na przyszły przypadek.

## Egzekwowanie

Skrypt `scripts/check-frontend-boundary.sh` jest częścią `pnpm check:source` i blokuje:

1. zależności frontendowe będące sterownikami bazy, ORM, SDK storage lub klientami brokera;
2. zależności frontendu od pakietów implementacyjnych innych usług;
3. odpowiadające im importy bezpośrednie;
4. dostęp do sekretów i adresów infrastruktury z `frontend/src`;
5. URI PostgreSQL, AMQP i S3 oraz wewnętrzne hosty infrastruktury;
6. `createServerFn`, import `server-only` i pliki `*.server.ts(x)` poza
   `frontend/src/server/bff`.

`scripts/test-frontend-boundary-policy.sh` wykonuje przypadek pozytywny i negatywne fixture:

- prawidłowy klient same-origin HTTP jest akceptowany;
- zależność `pg` jest odrzucana;
- import klienta S3 jest odrzucany;
- `DATABASE_URL` w frontendzie jest odrzucany;
- server function poza katalogiem BFF jest odrzucana;
- cienka server function w kontrolowanym katalogu BFF przechodzi politykę.

Polityka jest statyczną bramką repozytorium. Autoryzacja i walidacja po stronie NestJS nadal
pozostają obowiązkowe; kontrola importów nie jest granicą bezpieczeństwa uruchomionej usługi.
