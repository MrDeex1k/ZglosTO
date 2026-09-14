# Odbiór wdrożenia Bun i rollback

Faza 5 korzysta z produkcyjnych kontraktów obrazów, source build i bramek wydania. Lokalny drill nie zatwierdza produkcji. Kandydat produkcyjny nadal wymaga czystego drzewa, dokładnego tagu Git, natywnego hosta Linux, audytu i konfiguracji klienta.

## Lokalny drill Compose

```sh
bun run test:bun-deployment v1.0.0
# Dłuższa próba obciążenia:
BUN_SOAK_SECONDS=3600 bun run test:bun-deployment v1.0.0
```

Podaj faktyczny poprzedni tag wydania. Skrypt rozwiązuje tag do commita i buduje obrazy authorization, backendu/workera, gateway i frontendu z `git archive`. Nie podmienia samego runtime w nowym obrazie. Poprzednie polecenia, entrypoint, katalog roboczy i healthcheck pochodzą z archiwum oraz metadanych odtworzonych obrazów.

Test tworzy własny projekt `zglosto-bun-drill-*`, używa wyłącznie syntetycznych fixture'ów i portów 12635, 12636, 18432, 21956 oraz 17671. Zajęty port blokuje start. Wykonuje integrację kandydata, następnie trzy pary Node/Bun na tej samej bazie. Sprawdza faktyczny runtime usług, znacznik trwałości bazy i granicę anonimowego dostępu. Na końcu wykonuje soak Bun (domyślnie 600 s) i usuwa swój stack wraz z wolumenami.

Wyniki są zapisywane w ignorowanym `.state/bun-migration/<run>/`: tożsamość commita, stan zmian kandydata, obrazy, czasy odtworzenia, gotowości, p50/p95/p99, błędy, próbki RSS i statystyki Docker. Porównanie median trzech serii blokuje lokalny odbiór przy wzroście p95 lub RSS dowolnej usługi powyżej 10%. Brak prób i błędy żądań także blokują wynik.

To porównanie całych wydań, obejmujące również różnice bibliotek między tagiem a kandydatem. Mierzy odczyt bezpośrednio z backendu na lokalnym porcie 12636, z pominięciem cache Nginx; nie zastępuje certyfikacji ruchu zapisującego, kolejki, długich transferów ani pomiarów klienta. Czas gotowości zawiera rekreację kontenerów i oczekiwanie Compose. Statystyki CPU i RSS są próbkami, nie ciągłym profilem. Nie uruchamiaj innych obciążeń podczas porównania.

## Kubernetes i K3s

```sh
IMAGE_TAG=bun-acceptance bun run test:deployment:kubernetes
IMAGE_TAG=bun-acceptance bun run test:deployment:k3s
```

Wymagane narzędzia: Docker, kubectl, Helm, Bun oraz kind 0.32.0 lub k3d 5.9.0. Kind 0.32 obsługuje format konfiguracji containerd v4 używany przez przypięty obraz węzła. [Informacje o wydaniu kind](https://github.com/kubernetes-sigs/kind/releases/tag/v0.32.0).

Przed utworzeniem klastra skrypt uruchamia docelowy audyt wszystkich ośmiu obrazów. Kubernetes używa lokalnych portów 18135/18136, K3s 18235/18236. Przed HTTP test wymaga potwierdzenia związania własnego port-forwardu, więc zajęty port nie pozwala testować innego serwera. Skrypt odrzuca istniejący klaster o tej samej nazwie. Tworzy własny kubeconfig i katalogi Helm w katalogu tymczasowym; sprawdza kontekst przed instalacją kontrolerów. `KEEP_CLUSTER=1` zachowuje klaster oraz wypisany kubeconfig do diagnozy. Domyślnie usuwa klaster testowy.

Renderer tworzy tymczasową kopię konfiguracji Kustomize, przypina wszystkie osiem obrazów do wskazanego tagu i dołącza lokalny Redis do replikowanych usług. Nie zmienia źródłowych manifestów klienta. Waliduje kontrakt replik i odrzuca pozostałe obrazy `phase9-baseline`. Sonda Redis łączy się lokalnie, a sondy mTLS mają timeout zgodny z klientem. Health gatewaya przy zerowej liczbie replik zwraca 503 niezależnie od sposobu odrzucenia połączenia przez kube-proxy. Test obejmuje żywe CRD, readiness, routing, certyfikaty, KEDA, restart podów, trwałość bazy i reakcję Reloader.

## Bramka produkcyjna

Przed wdrożeniem wymagane są wszystkie dowody:

1. `bun run release:production:static` — w tym audyt bez advisory i błędów rejestru.
2. Pełny odbiór Mobile oraz docs-site po jego przywróceniu, zgodnie z zakresem wydania.
3. Natywne obrazy amd64 i arm64, konfiguracja white-label klienta, limity zasobów oraz test profilu docelowego. Emulacja amd64 nie zastępuje natywnej certyfikacji.
4. Pomiary obciążenia i minimum godzinny soak na wydzielonym hoście odbiorowym, z kontrolą błędów, pamięci, kolejki i telemetrii.
5. Odtworzenie dokładnego poprzedniego tagu oraz sprawdzenie zgodności bazy i sesji przy rollbacku. Lokalny znacznik i smoke nie zastępują pełnego scenariusza klienta.
6. Produkcyjny `validate` i runtime gate na właściwym hoście, z backupem przed wdrożeniem, maintenance window i próbą odtworzenia.

Nie oznaczaj całej fazy jako odebranej, gdy którykolwiek wymagany wynik jest brakujący lub negatywny. Raport lokalny celowo zawiera `productionCertified: false`.

## Powrót do poprzedniego wydania

Zachowaj dokładny tag i konfigurację poprzedniego wydania. Odbuduj jego cały zestaw artefaktów narzędziami zapisanymi w tym tagu na natywnym hoście; dla Node/pnpm użyj jego przypiętych wersji. Przed przełączeniem zachowaj backup. Wdróż komplet odtworzonych obrazów i konfiguracji, sprawdź readiness, logowanie/sesje, mTLS, media/kolejkę oraz telemetrię. Nie cofaj automatycznie migracji bazy.

Pozostaje kontrakt `exact-git-tag-rebuild`: aktywne wydanie jest zachowane do przejścia smoke kandydata, a późniejszy rollback wymaga odbudowy tagu. Nie wprowadzono stałej retencji poprzednich obrazów ani wyłączenia istniejących bramek bezpieczeństwa.
