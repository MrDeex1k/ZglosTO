# Polityka bezpieczeństwa ZgłosTO

## Wspierane wersje

Do czasu opublikowania pierwszego stabilnego wydania gałąź `main` otrzymuje poprawki
bezpieczeństwa na zasadzie best effort i nie jest deklarowana jako wspierane wydanie
produkcyjne. Po publikacji wspierane będzie wyłącznie najnowsze stabilne wydanie ZgłosTO.

| Wersja                          | Wsparcie    |
| ------------------------------- | ----------- |
| najnowsze stabilne wydanie      | tak         |
| `main` przed pierwszym wydaniem | best effort |
| wcześniejsze wydania            | nie         |

## Prywatne zgłaszanie podatności

Nie publikuj podatności, exploita, danych, sekretów ani proof of concept w publicznym issue,
pull requeście lub dyskusji.

Użyj mechanizmu GitHub Private Vulnerability Reporting:

1. otwórz zakładkę **Security** oficjalnego repozytorium;
2. przejdź do **Advisories**;
3. wybierz **Report a vulnerability**;
4. podaj opis, wpływ, dotkniętą wersję lub commit oraz bezpieczny sposób reprodukcji.

Jeżeli prywatne raportowanie jest chwilowo niedostępne, utwórz publiczne issue zawierające
wyłącznie prośbę o przywrócenie prywatnego kanału. Nie umieszczaj w nim żadnych szczegółów
technicznych podatności.

## Informacje potrzebne do analizy

W miarę możliwości podaj:

- dotknięty komponent, wersję albo SHA commita;
- wymagane warunki i konfigurację;
- wpływ na poufność, integralność lub dostępność;
- scenariusz ataku i wymagane uprawnienia;
- minimalne kroki reprodukcji lub bezpieczny proof of concept;
- proponowane ograniczenie skutków lub poprawkę, jeśli są znane.

Nie przesyłaj prawdziwych sekretów ani danych mieszkańców. Wrażliwe fragmenty logów i
konfiguracji należy zanonimizować.

## Oczekiwany przebieg

- potwierdzenie otrzymania: docelowo w ciągu 7 dni;
- wstępna kwalifikacja: docelowo w ciągu 14 dni od potwierdzenia;
- termin poprawki: ustalany na podstawie wpływu, złożoności i dostępnego ograniczenia
  skutków;
- komunikacja i dodatkowe pytania: w prywatnym wątku GitHub;
- ujawnienie: po wydaniu poprawki lub uzgodnionego ograniczenia skutków.

Są to cele organizacyjne, a nie gwarantowane terminy. Reporter może zostać wymieniony w
informacji o poprawce, jeśli wyrazi na to zgodę.

## Zakres

W zakresie znajdują się podatności mające konkretny wpływ na ZgłosTO, w szczególności w:

- frontendzie webowym i aplikacji Mobile opartej na React Native + Expo;
- backendzie NestJS, Authorization/Better Auth i `llm_gateway`;
- media workerze, przetwarzaniu obrazów i komunikacji RabbitMQ;
- PostgreSQL, PgBouncerze, Redisie i warstwie cache/rate limiting;
- Object Storage zgodnym z S3, w tym lokalnym RustFS;
- Nginx, TLS/mTLS, sesjach, rolach i granicach dostępu;
- profilach Docker Compose, K3s i Kubernetes dostarczanych z repozytorium;
- zarządzaniu konfiguracją, sekretami, backupem i odtwarzaniem;
- zależnościach zewnętrznych, jeśli podatność powoduje możliwy do wykazania wpływ na
  wdrożenie ZgłosTO.

## Poza zakresem

Bez wykazania konkretnego wpływu poza zakresem pozostają:

- surowe wyniki automatycznych skanerów;
- same brakujące nagłówki lub rekomendacje hardeningu bez scenariusza wykorzystania;
- social engineering i ataki fizyczne;
- problemy dotyczące niezmodyfikowanych usług zewnętrznych, które nie wynikają z ZgłosTO;
- ataki wymagające wcześniej uzyskanego legalnego dostępu do wszystkich właściwych
  sekretów i systemów;
- testy obciążeniowe, DoS, skanowanie cudzych instalacji i inne działania bez zgody ich
  właściciela.

## Zasady testowania w dobrej wierze

Testuj wyłącznie systemy, których jesteś właścicielem albo na których testowanie masz
wyraźną zgodę. Nie niszcz danych, nie utrzymuj dostępu, nie zakłócaj dostępności, nie
wykorzystuj podatności poza zakresem niezbędnym do jej potwierdzenia i przerwij test, jeśli
uzyskasz dostęp do cudzych danych. Zgłoś takie zdarzenie prywatnie bez kopiowania lub
ujawniania danych.

## Nagrody

Projekt nie prowadzi obecnie płatnego programu bug bounty. Przyjęty reporter może zostać
publicznie wskazany jako autor zgłoszenia po usunięciu podatności, o ile tego chce.
