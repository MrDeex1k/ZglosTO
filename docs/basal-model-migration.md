# Migracja klasyfikatora do Basal

## Aktualny wybór: oficjalny Basal 2.0 Mini 1,5B Q5_K_M

Na życzenie użytkownika model domyślny zmieniono na oficjalny artefakt
`Remek/basal-2.0-mini-GGUF/basal-2.0-mini-Q5_K_M.gguf`, rewizja
`9926cd8a62e7e65cba57aaab51d56c18b38f0a6b`. Rozmiar: 1 168 136 320 bajtów,
SHA-256: `9865d535e7497f5195a17292808d50969757ab390a5e8fbda5e9c17a3361f0b5`.
Lokalna referencja DMR: `zglosto/basal-2.0-mini:q5_k_m`, kontekst 4096 tokenów.

`scripts/prepare-basal-dmr.sh` pobiera ten plik bez przeliczania wag, sprawdza SHA-256
i rozmiar oraz pakuje go lokalnie. Nie wymaga Pythona, BF16, konwertera ani własnej
kwantyzacji. Zweryfikowany plik jest zachowany w `.local-models/`. Bazowy profil
LLM nadal jest wyłączony; profil lokalny i przykłady środowiska wskazują Mini Q5.

Szablon promptu i tokenizer są zgodne z wcześniej użytym Basal 2.0 4,5B.
Adapter nadal odczytuje decyzję z opcji A/B i zwraca `confidence: null` — nie
utożsamiamy surowego rozkładu z pewnością skalibrowaną na zgłoszeniach mieszkańców.
Oficjalny status pliku Q5 nie jest certyfikacją naszego zastosowania.

### Weryfikacja Mini Q5

Test 2026-11-14, DMR 1.2.9 / llama.cpp b9879, CPU na Apple M4 Pro, ten sam zestaw
30 syntetycznych polskich zgłoszeń. Obie kolejności opcji: łącznie 60 wywołań.
Wynik: **30/30 w każdej kolejności**, bez fallbacków, fałszywych alarmów,
pominiętych alarmów i różnic po zamianie opcji. W kolejności aplikacji p50 wyniosło
153 ms, p95 164 ms. Model był rozgrzany, pomiar sekwencyjny; nie jest to estymacja
jakości produkcyjnej ani test przepustowości.

Dla Mini zwiększono okno `logprobs` z 20 do 100. W próbie z 20 słabsza opcja wypadła
poza okno w dwóch odwróconych przypadkach (zaobserwowano pozycję 26), co słusznie
uruchamiało ścisły fallback. Odczyt 100 rozwiązał oba przypadki bez zmiany logitów,
próbkowania ani wymogu obecności obu kodów. Nadal nie zgadujemy brakującej opcji.

Rzeczywisty adapter aplikacji przeszedł 5 próbek z maksymalnym czasem 371 ms
przy limicie 5000 ms. Pierwsza próba przed rozgrzaniem modelu również przeszła
(max 1519 ms). Przeszło 60 testów gatewaya, typecheck gatewaya, integracji i skryptów,
build gatewaya, lint oraz walidacja 54 kombinacji Compose i konfiguracji klastra.
Pełnego stosu HTTP/mTLS/Redis nie uruchamiano ponownie.

[Dowód Mini Q5](evidence/basal-mini-q5-2026-11-14.json).

```bash
./scripts/prepare-basal-dmr.sh
BASAL_BENCHMARK_MODEL=zglosto/basal-2.0-mini:q5_k_m \
BASAL_BENCHMARK_VARIANT=basal-2.0-mini \
BASAL_BENCHMARK_URL=http://127.0.0.1:12434/engines/llama.cpp/v1 \
BASAL_BENCHMARK_TIMEOUT_MS=5000 \
BASAL_BENCHMARK_OUTPUT=/tmp/basal-mini-q5.json \
bun scripts/benchmark-basal.ts
```

[Oficjalny plik i walidacja autora](https://huggingface.co/Remek/basal-2.0-mini-GGUF).

## Archiwalny etap Q4 — zastąpiony oficjalnym Mini Q5

1. Porównać Basal 2.0 4,5B i Basal Omni 1.0 Mini E4B w Q4_K_M na tych samych polskich zgłoszeniach.
2. Sprawdzić oba porządki opcji, błędy klasyfikacji, brak odpowiedzi, czasy odpowiedzi i zgodność z DMR.
3. Wybrać model na podstawie wyników; dopiero wtedy zmienić domyślną konfigurację Compose, gatewaya i przykłady środowiska.
4. Zweryfikować kontrakt gatewaya, fallback, gotowość oraz konfigurację wdrożenia i otworzyć PR do `main`.

### Zakres eksperymentu

Q4_K_M obu modeli jest lokalną konwersją testową. Oficjalny Basal 2.0 udostępnia
Q5_K_M i Q8_0. Autor Omni Mini publikuje Q6_K i Q8_0; Q4/Q5 nie przeszły jego bramki
jakości. Wynik na małym zbiorze zgłoszeń nie zastępuje tej walidacji ani kalibracji
na danych docelowych. Gateway nie przedstawia surowego prawdopodobieństwa Q4 jako
skalibrowanej pewności: pole `confidence` pozostaje `null`.

Źródła wag:

| Model               | Repozytorium Hugging Face   | Rewizja                                    |
| ------------------- | --------------------------- | ------------------------------------------ |
| Basal 2.0 4,5B      | `Remek/basal-2.0-4.5B`      | `a21eae2ebf988274f2e6326925525012c3bd36d8` |
| Basal Omni 1.0 Mini | `Remek/basal-omni-1.0-mini` | `a7a495ff99d8c55df5402c1f932e58d52c3a1ad2` |

Konwersja: źródłowe BF16 → F16 → Q4_K_M, narzędziami llama.cpp `b11312`.
Dla Basal 2.0 wymagana jest poprawka tokenizera z `basal-export-gguf` `v2.8.0`.
Nie stosujemy ponownej kwantyzacji z Q5/Q8. Omni E4B ma około 15,9 GB źródłowych
wag; oznaczenie E4B opisuje efektywny rozmiar, a nie wielkość pliku do pobrania.

### Protokół aplikacji

Basal odczytuje decyzję z logitów kodów opcji po dokładnym szablonie modelu i prefillu
`{"answer": "`. DMR otrzymuje `POST /v1/completions`, pojedynczy token oraz logprobs.
Gateway wybiera pomiędzy kodami A/B, niezależnie od wylosowanego tekstu. Brak obu
kodów lub niepoprawne liczby oznaczają `invalid_response`. Opis mieszkańca stanowi
dane; adres i miasto nie są wysyłane do modelu.

Zewnętrzny adapter OpenAI zachowuje dotychczasowy kontrakt JSON. Backend i klienci
nadal używają `municipal` / `emergency` / kontrolowanego fallbacku.

### Źródła

- [Modele i wydania Basal](https://github.com/rkinas/basal/tree/v2.8.0)
- [Protokół FORMAT2](https://github.com/rkinas/basal/blob/v2.8.0/docs/FORMAT2.md)
- [Konwersja i poprawka tokenizera](https://github.com/rkinas/basal/blob/v2.8.0/docs/GGUF.md)
- [Oficjalne porty Basal 2.0 4,5B](https://huggingface.co/Remek/basal-2.0-4.5B-GGUF)
- [Oficjalne porty Omni Mini i ograniczenia Q4](https://huggingface.co/Remek/basal-omni-1.0-mini-GGUF)

### Odtworzenie archiwalnego testu Q4

Archiwalny wariant Basal 2.0 4,5B wymagał konwersji przez `basal-export-gguf`
v2.8.0 do F16, następnie `llama-quantize ... Q4_K_M` z poprawką tokenizera.
Obecny `scripts/prepare-basal-dmr.sh` pobiera już wyłącznie oficjalny Mini Q5.
Omni przygotowano tym samym konwerterem `llama.cpp b11312`, z przypiętych wag
powyżej: `convert_hf_to_gguf.py MODEL_DIR --outtype f16 --outfile omni-F16.gguf`,
a następnie `llama-quantize omni-F16.gguf basal-omni-1.0-mini-Q4_K_M.gguf Q4_K_M`.
Katalog źródłowy nosił nazwę `basal-omni-1.0-mini`. Konwerter działał w trybie
tekstowym (bez `--mmproj`). Dla Omni nie stosuje się poprawki tokenizera Bielika.
Pliki źródłowe obejmowały `model.safetensors`, `config.json`, `tokenizer.json`,
`tokenizer_config.json`, `chat_template.jinja`, `generation_config.json`,
`processor_config.json` i pliki kalibracji. Wagi i F16 usunięto po konwersji,
zachowując testowe GGUF i ich sumy kontrolne.

Import Omni do DMR:

```bash
docker model package --gguf /absolute/path/basal-omni-1.0-mini-Q4_K_M.gguf \
  --context-size 4096 zglosto/basal-omni-1.0-mini:q4_k_m
```

Przykład uruchomienia wspólnego benchmarku (serwer DMR musi już działać):

```bash
BASAL_BENCHMARK_MODEL=zglosto/basal-2.0-4.5b:q4_k_m \
BASAL_BENCHMARK_VARIANT=basal-2.0-4.5b \
BASAL_BENCHMARK_LOGPROBS=20 \
BASAL_BENCHMARK_URL=http://127.0.0.1:12434/engines/llama.cpp/v1 \
BASAL_BENCHMARK_TIMEOUT_MS=5000 \
BASAL_BENCHMARK_OUTPUT=/tmp/basal-2.0-benchmark.json \
bun scripts/benchmark-basal.ts
```

Dla Omni zmień `MODEL` na `zglosto/basal-omni-1.0-mini:q4_k_m`,
`VARIANT` na `basal-omni-1.0-mini` i ścieżkę wyniku. Zestaw wejściowy:
`tests/fixtures/llm/basal-classification.json`; skrypt zapisuje jego SHA-256.
Wyniki `summary.perOrder.forward` odpowiadają pojedynczej kolejności używanej
przez aplikację. Główny `summary.accuracy` dodatkowo ocenia średnią rozkładów
z obu kolejności; nie należy utożsamiać tych dwóch sposobów decyzji.

Pomiar natywny używał tego samego `llama-server b11312` dla obu modeli:
`-c 4096 -np 1 -ngl 99 -t 6 -tb 6 -fa on`, na porcie `18081` z bazą `/v1`.
Serwery uruchamiano kolejno, bez równoczesnej inferencji drugiego modelu.
Nie należy porównywać czasów CPU w DMR z czasami Metal jako zmiany samego modelu.

### Wyniki 2026-11-14

Sprzęt: Apple M4 Pro, 12 rdzeni logicznych, 24 GiB RAM; limit VM Dockera 11,73 GiB.
DMR 1.2.9, llama.cpp `b9879-72874f559`, CPU. Mimo wcześniejszej obawy o numer
wersji rzeczywiste uruchomienie **obu** architektur przez ten DMR zakończyło się
powodzeniem. Drugi pomiar: natywny llama.cpp `b11312-0c1e57098`, Metal.

Wyniki jednej kolejności używanej przez aplikację (`forward`, 30 wywołań na model):

| Model Q4_K_M            | Plik    | DMR p50 / p95  | Metal p50 / p95 | Poprawne w DMR i Metal |
| ----------------------- | ------- | -------------- | --------------- | ---------------------- |
| Basal 2.0 4,5B          | 2,88 GB | 533 / 1352 ms  | 136 / 314 ms    | 30/30                  |
| Basal Omni 1.0 Mini E4B | 5,30 GB | 1623 / 1772 ms | 382 / 416 ms    | 30/30                  |

Każdy z czterech przebiegów obejmował dodatkowo odwróconą kolejność opcji:
łącznie 240 wywołań. Nie wystąpiły fallbacki, pominięte alarmy, fałszywe alarmy ani
zmiany klasy po zamianie kolejności. Zbiór jest syntetyczny i niewielki; wynik 30/30
nie stanowi estymacji trafności na rzeczywistych zgłoszeniach ani dowodu przewagi
jakości nad Gemmą. Pomiar jest sekwencyjny, nie jest testem przepustowości.

Po zakończeniu serii `docker stats` pokazał 3,264 GiB dla Basal 2.0 i 4,164 GiB dla
Omni. To chwilowe wartości kontenera, nie szczytowe wymagania RAM. Maksymalny RSS
natywnych procesów (`/usr/bin/time -l`) wyniósł odpowiednio 3 440 721 920 oraz
6 016 565 248 bajtów; nie jest to pełny bilans pamięci Metal/systemu.

W etapie Q4 wybrano **Basal 2.0 4,5B Q4_K_M**: przy identycznym wyniku na tym zestawie ma mniejszy
artefakt i niższe opóźnienia. Wynik ten jest archiwalny; obecny wybór to Mini Q5 opisany poniżej. Kontrola przez rzeczywisty adapter aplikacji przeszła
5 próbek z maksymalnym czasem 3893 ms przy budżecie 5000 ms, także po ponownym
załadowaniu modelu. Pełny stos HTTP/mTLS/Redis nie był uruchamiany dla tego pomiaru.

[Dowód pomiarów, sumy artefaktów i metryki obu kolejności](evidence/basal-q4-2026-11-14.json).
Dodatkowa walidacja: 59 testów gatewaya, 9 testów kontraktu backendu, 17 testów
infrastruktury, typecheck gatewaya i integracji, build gatewaya, lint zmienionego TS,
54 kombinacje modułów produkcyjnego Compose, kontrole konfiguracji klastra oraz
rzeczywisty transport HTTP stubu (obie klasy, timeout, niedostępność, błędna
odpowiedź i readiness). Skrypt przygotowania sprawdzono na istniejącym poprawnym
GGUF; świeżą konwersję wykonano wcześniej tymi samymi poleceniami i narzędziami.

## Prywatna diagnostyka klasyfikacji

Gateway zapisuje surowy rozkład odczytany z kodów A/B jako diagnostykę wewnętrzną.
`confidence` pozostaje `null` (brak kalibracji dla naszych zgłoszeń). Pola bazy:

| Kolumna                   | Znaczenie                                                               |
| ------------------------- | ----------------------------------------------------------------------- |
| `llm_confidence_raw`      | Większa z dwóch surowych wartości po softmax A/B                        |
| `llm_p_emergency_raw`     | Surowy wynik opcji `emergency`, niezależnie od wybranej klasy           |
| `llm_model_id`            | Referencja modelu podana w żądaniu DMR                                  |
| `llm_model_revision`      | Digest SHA-256 faktycznie obsłużonego pakietu OCI DMR                   |
| `llm_prompt_version`      | Wersja pytania, opcji i sposobu budowania promptu                       |
| `llm_latency_ms`          | Czas od rozpoczęcia klasyfikacji w gatewayu do odczytu odpowiedzi, w ms |
| `llm_calibration_version` | Wersja zastosowanej kalibracji; obecnie `NULL`                          |

Digest pakietu pochodzi z odpowiedzi DMR (`model`, ścieżka bundle), a nie z nazwy
tagu ani założenia o zawartości lokalnego magazynu. Nie jest tym samym identyfikatorem
co SHA-256 pliku GGUF. Jeśli serwer nie podaje rozpoznawalnego digestu, rewizja jest
`NULL`. Wersję promptu `municipal-emergency-v1` należy zmienić wraz ze zmianą pytania,
znaczenia opcji, ich kolejności lub szablonu. Sama zmiana modelu jest identyfikowana
osobno przez jego referencję i digest.

Wynik backendu rozdziela publiczny kontrakt klasyfikacji od prywatnej diagnostyki.
Pola są zapisywane przy `INSERT INTO incydenty`; nie są dodawane do DTO odpowiedzi
ani endpointów listowania, także administracyjnych. Frontend pozostaje bez zmian.
Nie wprowadzono progów confidence ani zmiany decyzji klasyfikatora. Niepoprawna
opcjonalna diagnostyka jest pomijana bez odrzucenia prawidłowej klasyfikacji.

Przy fallbacku oba surowe wyniki są `NULL`. Jeśli gateway zdołał ustalić czas i znaną
konfigurację, te metadane mogą pozostać zapisane; przy awarii transportu do gatewaya
cała diagnostyka jest `NULL`. Starsze rekordy i zewnętrzne modele bez tego protokołu
również mają `NULL`, a nie wymyślone wartości historyczne.

Migracja istniejących wolumenów: `database/migrations/017-private-llm-diagnostics.sql`.
Należy zastosować ją przed uruchomieniem nowego backendu. Produkcyjne i integracyjne
skrypty wykonują migracje przez istniejącą listę `migrations/*.sql`. Schemat inicjalny
zawiera te same kolumny i ograniczenia. Wyniki muszą należeć do [0,1], tworzyć spójną
parę i nie mogą występować dla fallbacków; czas nie może być ujemny.

Surowy wynik nie jest miarą trafności. Do sprawdzania jakości potrzebna jest także
próbka zgłoszeń z prawidłową klasą potwierdzoną przez człowieka; workflow zbierania
etykiet oraz dopasowanie kalibracji pozostają kolejnym etapem. Obecna zmiana dostarcza
prywatny materiał diagnostyczny bez wpływu na mieszkańca.

### Weryfikacja prywatnego zapisu

Przeszło 75 testów kontraktów, 66 gatewaya, 136 backendu (3 pominięte) oraz
4 testy rzeczywistego PostgreSQL: ponowienie migracji, stare rekordy, świeży schemat,
zakresy wartości, fallbacki i niepoprawne metadane. Typecheck i build tych trzech
workspace również przeszły. Testy HTTP backendu uruchomiono z dostępem do lokalnych
portów testowych.

Osobny test ręczny wykonał rzeczywistą inferencję DMR dla obu klas, serializację
wyniku gatewaya, normalizację backendu i `PostgresIncidentAdapter.createIncident`
z rzeczywistym klientem `pg`. Zapytania `INSERT` i `SELECT` wykonywały się w
jednorazowym PostgreSQL. Sprawdzono zapis siedmiu pól oraz brak diagnostyki w
odpowiedziach create/list. Po teście kontener usunięto. Transport HTTP/mTLS/Redis
między usługami w tym teście nie był uruchamiany; dotychczasowych baz nie zmieniano.

[Dowód rzeczywistego zapisu](evidence/basal-private-diagnostics-2026-11-14.json).
Przykłady zapytań analitycznych są w [README bazy](../database/README_DATABASE.md).
