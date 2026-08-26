# Faza 9 / krok 10 — scale-to-zero `llm_gateway`

## Decyzja

Krok wdrożono 2026-07-24 dla Kubernetes i K3s. Wybrano KEDA 2.20 z KEDA HTTP Add-on
0.15.0 oraz API `http.keda.sh/v1beta1` `InterceptorRoute`. Knative Serving został
odrzucony jako druga ścieżka produkcyjna.

| Kryterium                                    | KEDA HTTP Add-on      | Knative Serving                     |
| -------------------------------------------- | --------------------- | ----------------------------------- |
| zgodność z autoskalowaniem workera           | ten sam operator KEDA | osobny stos                         |
| narzut na mały K3s                           | mniejszy              | większy                             |
| zachowanie obecnego Deployment/Service       | tak                   | wymaga modelu Knative Service       |
| HTTP scale-to-zero i buforowanie cold startu | tak                   | tak                                 |
| liczba produkcyjnych ścieżek w repo          | jedna                 | druga, odrzucona                    |
| dojrzałość użytego API                       | v1beta1               | dojrzalszy, ale operacyjnie cięższy |

KEDA lepiej pasuje do obecnego systemu: KEDA jest już wymagana dla `media_worker`,
`llm_gateway` jest bezstanowym Hono, a K3s ma pozostać lekki. Ceną jest przed-1.0 linia
wydania dodatku i API `v1beta1`. Dlatego manifest jest wdrożony, wersja i API są przypięte,
ale ostateczna certyfikacja produkcyjna pozostaje bramką Fazy 12. Jeśli testy tej bramki
ujawnią wadę blokującą, ADR-011 musi zostać otwarty ponownie; nie utrzymujemy równolegle
Knative.

## Przepływ

1. Backend wywołuje `http://llm-gateway-proxy:8080`.
2. `llm-gateway-proxy` jest Service `ExternalName` prowadzącym do interceptora KEDA w
   namespace `keda`.
3. `InterceptorRoute/llm-gateway` przypisuje żądanie do Service `llm-gateway:8130`.
4. Przy zerowej liczbie podów interceptor przechowuje żądanie podczas cold startu.
5. Zewnętrzny scaler KEDA skaluje Deployment na podstawie współbieżności, docelowo po
   cztery żądania na replikę.

Skala wynosi `0-4`. Po `300 s` bez ruchu gateway może wrócić do zera. Timeout interceptora
wynosi `6 s`, readiness `5 s`, a nagłówków odpowiedzi `5 s`; mieszczą się we wcześniej
przyjętym całkowitym budżecie backendu `7 s` i budżecie runtime'u modelu `5 s`.
Timeout, niedostępny gateway lub model nadal uruchamiają istniejący fallback i nie blokują
zapisu zgłoszenia.

Nginx zachowuje bezpośredni, wewnętrzny healthcheck gatewaya. Ruch produktowy backendu nie
może omijać interceptora. NetworkPolicy zezwala backendowi na port interceptora `8080`
oraz podom kontrolerów w wydzielonym namespace `keda` na port gatewaya `8130`.

## Wymagania klastra

Przed zastosowaniem overlayu oba kontrolery muszą działać w namespace `keda`:

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm upgrade --install keda kedacore/keda \
  --namespace keda --create-namespace --version 2.20.0 --wait
helm upgrade --install http-add-on kedacore/keda-add-ons-http \
  --namespace keda --version 0.15.0 --wait
```

`deploy.sh` odrzuca klaster bez CRD `ScaledObject`, `TriggerAuthentication`,
`InterceptorRoute` albo bez usług external scalera i proxy interceptora. Po wdrożeniu
czeka na warunek `Ready` trasy oraz obu `ScaledObject`.

## Walidacja

`pnpm check:cluster-autoscaling` sprawdza wszystkie 12 kompozycji Kubernetes/K3s:

- brak historycznego `HTTPScaledObject`;
- ruch backendu wyłącznie przez proxy;
- API, target, concurrency, timeouty oraz skalę `0-4`;
- izolację NetworkPolicy;
- deterministyczną kolejność renderowania zależności;
- brak emulacji scale-to-zero w Compose.

Faza 12 sprawdza na realnych klastrach przejście `0 -> 1 -> 0`, cold start, burst,
aktualizację dodatku, awarię external scalera i pełny przepływ zapisu zgłoszenia podczas
timeoutu.
