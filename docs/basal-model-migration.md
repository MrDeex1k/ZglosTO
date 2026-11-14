# Migracja klasyfikatora do Basal

## Plan

1. Porównać Basal 2.0 4,5B i Basal Omni 1.0 Mini E4B w Q4_K_M na tych samych polskich zgłoszeniach.
2. Sprawdzić oba porządki opcji, błędy klasyfikacji, brak odpowiedzi, czasy odpowiedzi i zgodność z DMR.
3. Wybrać model na podstawie wyników; dopiero wtedy zmienić domyślną konfigurację Compose, gatewaya i przykłady środowiska.
4. Zweryfikować kontrakt gatewaya, fallback, gotowość oraz konfigurację wdrożenia i otworzyć PR do `main`.

## Zakres eksperymentu

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

## Protokół aplikacji

Basal odczytuje decyzję z logitów kodów opcji po dokładnym szablonie modelu i prefillu
`{"answer": "`. DMR otrzymuje `POST /v1/completions`, pojedynczy token oraz logprobs.
Gateway wybiera pomiędzy kodami A/B, niezależnie od wylosowanego tekstu. Brak obu
kodów lub niepoprawne liczby oznaczają `invalid_response`. Opis mieszkańca stanowi
dane; adres i miasto nie są wysyłane do modelu.

Zewnętrzny adapter OpenAI zachowuje dotychczasowy kontrakt JSON. Backend i klienci
nadal używają `municipal` / `emergency` / kontrolowanego fallbacku.

## Źródła

- [Modele i wydania Basal](https://github.com/rkinas/basal/tree/v2.8.0)
- [Protokół FORMAT2](https://github.com/rkinas/basal/blob/v2.8.0/docs/FORMAT2.md)
- [Konwersja i poprawka tokenizera](https://github.com/rkinas/basal/blob/v2.8.0/docs/GGUF.md)
- [Oficjalne porty Basal 2.0 4,5B](https://huggingface.co/Remek/basal-2.0-4.5B-GGUF)
- [Oficjalne porty Omni Mini i ograniczenia Q4](https://huggingface.co/Remek/basal-omni-1.0-mini-GGUF)

## Odtworzenie testu

Skrypt `scripts/prepare-basal-dmr.sh` odtwarza i importuje wariant Basal 2.0.
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

## Wyniki 2026-11-14

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

Wybrano **Basal 2.0 4,5B Q4_K_M**: przy identycznym wyniku na tym zestawie ma mniejszy
artefakt i niższe opóźnienia. Domyślny profil aplikacji pozostaje wyłączony; lokalny
profil LLM używa nowego modelu. Kontrola przez rzeczywisty adapter aplikacji przeszła
5 próbek z maksymalnym czasem 3893 ms przy budżecie 5000 ms, także po ponownym
załadowaniu modelu. Pełny stos HTTP/mTLS/Redis nie był uruchamiany dla tego pomiaru.

[Dowód pomiarów, sumy artefaktów i metryki obu kolejności](evidence/basal-q4-2026-11-14.json).
Dodatkowa walidacja: 59 testów gatewaya, 9 testów kontraktu backendu, 17 testów
infrastruktury, typecheck gatewaya i integracji, build gatewaya, lint zmienionego TS,
54 kombinacje modułów produkcyjnego Compose, kontrole konfiguracji klastra oraz
rzeczywisty transport HTTP stubu (obie klasy, timeout, niedostępność, błędna
odpowiedź i readiness). Skrypt przygotowania sprawdzono na istniejącym poprawnym
GGUF; świeżą konwersję wykonano wcześniej tymi samymi poleceniami i narzędziami.
