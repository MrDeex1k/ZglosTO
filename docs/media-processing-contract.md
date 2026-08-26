# Kontrakt asynchronicznego przetwarzania mediów

## Status i zakres

Kontrakt V1 został wdrożony w Fazie 3, kroku 8. Obejmuje współdzielone typy TypeScript,
parsery runtime, rewizje zdjęć, trwały stan zadania i PostgreSQL outbox. Faza 6, krok 9
uruchomił RabbitMQ oraz publisher, krok 10 osobny proces `media_worker`, a krok 11 aktywował
handler, dostęp do Object Storage i właściwy pipeline Sharp.

## Granice danych

Zdarzenie `media.image.process.requested` zawiera wyłącznie:

- `contractVersion`, `eventType` i unikalny `eventId`;
- stabilny `jobId`, `imageId`, `imageRevision` i `incidentId`;
- rodzaj zdjęcia `report` albo `resolution`;
- object key oryginału, MIME, rozmiar i checksum SHA-256;
- czas żądania, bieżącą próbę i maksymalną liczbę prób.

Wiadomość nie zawiera bajtów, `Buffer`, base64 ani data URL. Worker pobiera oryginał przez
neutralny `ObjectStorage`.

Źródłem typów i parserów jest `@zglosto/contracts/media`. Wersja V1 nie jest modyfikowana
wstecznie w sposób niekompatybilny; zmiana pól wymaganych oznacza nową wersję kontraktu,
routing key i kolejkę.

## Topologia V1

- exchange: `zglosto.media.v1`;
- routing key: `media.image.process.v1`;
- kolejka główna: `zglosto.media.process.v1`;
- kolejki retry: `zglosto.media.process.retry.5s.v1`, `.30s.v1` i `.5m.v1`;
- DLQ: `zglosto.media.process.dlq.v1`;
- próby: pierwsze wykonanie i maksymalnie trzy ponowienia;
- backoff: 5 sekund, 30 sekund i 5 minut.

RabbitMQ używa durable exchange/queues typu quorum, persistent messages i publisher confirms.
Warstwa konsumencka wymusza manual ACK i kontrolowany `prefetch`. Przed ACK retry jest
publikowane z confirm do odpowiedniej kolejki TTL; trwały błąd jest odrzucany do DLQ.

## Stan i idempotencja

`incident_images.revision` rośnie przy każdym ponownym przesłaniu zdjęcia. Każda para
`imageId + imageRevision` ma dokładnie jedno zadanie w `media_processing_jobs` i jedno
zdarzenie żądania w `outbox_events`.

Stany zadania:

`pending -> published -> processing -> succeeded`

Ścieżki alternatywne:

- błąd retryable wraca do kolejnej próby zgodnie z backoffem;
- wyczerpanie prób kończy się `dead_lettered`;
- błąd trwały kończy się `failed`;
- nowsza rewizja zdjęcia oznacza `superseded` dla starego zadania.

Przed zapisem wyniku worker musi porównać `jobId`, `imageId`, `imageRevision` i object key z
bieżącym rekordem. Powtórne dostarczenie zakończonego zadania ma zwrócić ten sam efekt bez
drugiego zapisu. Wynik starej rewizji nie może zmienić nowszego zdjęcia. Receipt konsumenta i
końcowa zmiana stanu są zapisywane w jednej transakcji PostgreSQL.

## Pipeline obrazu

Worker weryfikuje rozmiar, checksum SHA-256 i MIME obiektu względem envelope, a następnie
sprawdza typ za pomocą dekodera Sharp. Obsługiwane są pojedyncze JPEG, PNG, GIF i WebP;
animacje oraz pliki niedekodowalne są odrzucane. Domyślne limity wejścia to 5 MiB, 8192 px
na wymiar i 32 miliony pikseli. Wyjście jest obracane zgodnie z orientacją, zmniejszane tak,
aby dłuższy bok miał maksymalnie 2000 px bez powiększania, normalizowane do sRGB i kodowane
do WebP quality 85/effort 4.
Metadane EXIF, ICC i XMP nie są kopiowane.

Key wyniku jest deterministyczny:
`{incidentId}/{imageKind}/{imageId}/revision-{imageRevision}.webp`. Po atomowym zatwierdzeniu
stanu `ready` oryginał jest usuwany. Nieudane usunięcie jest ponawiane przez idempotentny
cleanup `media_worker`, a PostgreSQL zapisuje `original_deleted_at`.
Liczba równoległych operacji Sharp i `prefetch` są domyślnie równe `1`, aby ograniczyć skoki
CPU i pamięci procesu.

W docelowym K8s/K3s `media_worker` jest Deploymentem skalowanym przez KEDA na podstawie
backlogu RabbitMQ. Profil podstawowy utrzymuje `1-4` repliki: osiągnięcie 4 oczekujących
zdjęć uruchamia drugą replikę, a kolejne granice to 8 i 12. Desired replicas wynoszą: `1` dla
backlogu `0-3`, `2` dla `4-7`, `3` dla `8-11` oraz `4` dla `12+`. Czwarta wiadomość może być
obsługiwana przez pierwszą replikę podczas startu drugiej. Każda replika zachowuje
`prefetch=1` i Sharp concurrency `1`. Scale-to-zero nie jest domyślnym profilem.
Jeżeli przez nieprzerwane 180 sekund backlog utrzymuje się w zakresie `0-3`, autoscaler wraca
do jednej repliki. Ponowne osiągnięcie co najmniej 4 oczekujących zdjęć zeruje to okno.
Skalowanie w dół nie może przerwać zadania oczekującego na manual ACK. Dokładną funkcję
`min(floor(backlog / 4) + 1, 4)` realizuje wdrożone KEDA `scalingModifiers` z metryką
złożoną typu `Value` i celem `1`; zwykłe `QueueLength value: 4` nie gwarantuje drugiej
repliki przy backlogu równym dokładnie `4`. Okno 180 sekund należy do zachowania scale-down
HPA, ponieważ `cooldownPeriod` KEDA steruje zejściem do zera. Trigger korzysta z AMQPS i
Service CA, a fallback przy awarii metryki utrzymuje jedną replikę. Szczegóły i testy
granic opisuje [Faza 9 / krok 9](phase-9-step-9-media-worker-autoscaling.md).

## Wyniki

Sukces `media.image.process.succeeded` zawiera metadane prywatnego WebP: object key, MIME
`image/webp`, rozmiar, checksum SHA-256, szerokość, wysokość i czas zakończenia.

Błąd `media.image.process.failed` używa zamkniętego katalogu kodów oraz flagi `retryable`.
Komunikat techniczny i stack trace pozostają w logach/telemetrii, nie w kontrakcie domenowym.

## Transactional outbox

Przeglądarka pobiera od backendu krótkotrwały kontrakt presigned PUT. Dla lokalnego RustFS
wysyła oryginał przez dedykowany host `uploads.*` na NGINX, który strumieniuje wyłącznie
`PUT`/`OPTIONS` do prywatnego `rustfs:9000`; RustFS nie publikuje portu hosta. Dla zewnętrznego
S3/R2 adres prowadzi bezpośrednio do providera. Backend podpisuje MIME, checksum i dokładny
`Content-Length`, narzuca limit 5 MiB oraz po uploadzie sprawdza `HEAD`. Próba wysłania
większego body pod tym samym URL jest odrzucana przez Object Storage, a Sharp ponownie
weryfikuje faktyczne bajty. Następnie
backend w jednej transakcji PostgreSQL:

1. atomowo konsumuje jednorazowy `uploadId`;
2. blokuje logiczny slot `incidentId + imageKind` advisory lockiem;
3. aktualizuje `incident_images` i zwiększa rewizję;
4. oznacza starsze zadania jako `superseded` i nieopublikowane zdarzenia jako `discarded`;
5. tworzy `media_processing_jobs`;
6. zapisuje kompletne, zwalidowane zdarzenie V1 w `outbox_events`.

Błąd transakcji pozostawia upload jako `pending`; cleanup usuwa go po wygaśnięciu, dzięki
czemu równoległe żądanie nie może usunąć obiektu konsumowanego przez inne zgłoszenie.
Publisher pobiera rekordy partiami
przez `FOR UPDATE SKIP LOCKED`, odzyskuje stare blokady, używa publisher confirms i oznacza je
jako `published` dopiero po potwierdzeniu brokera. Niedostępność RabbitMQ ustawia kontrolowany
stan `failed` z kolejnym terminem publikacji.
