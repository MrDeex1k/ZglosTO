# ZgłosTO 1.0.0

## Zakres wydania

`1.0.0` jest pierwszym wspólnie wersjonowanym baseline'em całego monorepo. Obejmuje
frontend, usługi backendowe, prywatne pakiety współdzielone, konfiguracje wdrożeniowe oraz
gotową aplikację mobilną Expo/React Native dla mieszkańców i służb. `Mobile` należy do
grafu PNPM i Turborepo. Wydanie dostarcza jej źródła, ale nie publikuje wspólnych binariów
w App Store ani Google Play.

Wszystkie workspace'y są prywatne i nie są przeznaczone do publikacji w rejestrze NPM.
Artefaktem produktu pozostaje repozytorium źródłowe, lokalnie budowane obrazy kontenerowe
oraz kod Mobile budowany i podpisywany osobno przez każdego klienta.

## Licencja i wkłady zewnętrzne

Wydanie jest udostępniane jako source-available na warunkach PolyForm Internal Use License
1.0.0. Licencja pozwala organizacji używać i modyfikować ZgłosTO oraz integrować je z jej
wewnętrznymi produktami. Nie zezwala na redystrybucję, sublicencjonowanie, sprzedaż ani
świadczenie usług dla podmiotów trzecich. Projekt nie jest określany jako open source w
rozumieniu Open Source Initiative.

Zewnętrzne wkłady podlegają `CONTRIBUTING.md` i `CLA.md`. Osobne pozwolenie na
współtworzenie umożliwia przygotowanie publicznego forka i pull requesta wyłącznie do
oficjalnego repozytorium. Podatności są przyjmowane prywatnie zgodnie z `SECURITY.md`.

## Konwencja historii

Od tego wydania nowe komunikaty Git muszą być zgodne z Conventional Commits. Husky
uruchamia Commitlint w hooku `commit-msg`. Zalecany pierwszy commit nowej historii:

```text
chore(repo): release 1.0.0
```

Pierwszy commit i wszystkie późniejsze commity podlegają tej samej konfiguracji
Conventional Commits, bez wyjątków dla historii bazowej.

Dozwolone podstawowe typy to `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore` i `revert`. Scope pozostaje opcjonalny, a nagłówek ma maksymalnie
100 znaków.

## Bramka wydania

Przed utworzeniem taga `v1.0.0` należy zachować wyniki:

1. `pnpm check`;
2. `pnpm peers check`;
3. surowy `pnpm audit --prod` oraz polityka `pnpm audit:release`;
4. `pnpm release:production:static`;
5. walidacji docelowych obrazów i Compose;
6. testu runtime na docelowym hoście, jeżeli wydanie ma być certyfikowane jako konkretne
   wdrożenie produkcyjne.
7. sprawdzenia, że repozytorium zawiera aktualne `LICENSE`, `CONTRIBUTING.md`, `CLA.md` i
   `SECURITY.md`, a pakiety nie deklarują wcześniejszej licencji MIT.
8. aktualnego manifestu plików i sum kontrolnych.

### Historyczny wynik kandydata z 2026-08-18

- `pnpm check` — zaliczony;
- `pnpm peers check` — zaliczony;
- `pnpm audit --prod --audit-level=moderate` — zero znanych podatności;
- `pnpm test:integration` — zaliczony po pełnej przebudowie izolowanego Compose;
- `pnpm release:production:static` — zaliczony;
- Commitlint — akceptuje prawidłowy Conventional Commit i odrzuca komunikat bez typu;
- Turborepo — wykrywa 12 workspace'ów, w tym `@zglosto/mobile`.

Wynik potwierdził ówczesny baseline, ale nie zastępuje końcowej bramki po ukończeniu Mobile
i porządkach repozytorium. Wszystkie kontrole należy uruchomić ponownie na dokładnym drzewie,
które stanie się pierwszym committem i tagiem `v1.0.0`. Bramki
`release:production:validate` oraz `release:production:runtime` pozostają zależne od
konkretnego hosta klienta i nie są warunkiem publikacji samych źródeł.

Aktualny wynik kandydata, dokładne komendy, czasy i ostrzeżenia zapisano w
[raporcie weryfikacji](release-1.0.0-verification.md). Faza A dodała statyczny skan
publikowanego drzewa oraz dokładną, wygasającą
[akceptację ryzyka `image-size`](security-risk-acceptance-image-size.md). Decyzją
właściciela z 2026-08-26 Trivy i SBOM nie należą do bramki ani artefaktów wydania 1.0.0.
Krok przejściowy po Fazie A usunął je z aktywnego pipeline'u, kontraktu produkcyjnego
builda, manifestu i skryptów pakietowych. W dokumentach zakończonych faz pozostają jedynie
historyczne opisy pierwotnej realizacji.

## Kolejność domknięcia publikacji

1. **Faza A — zakończona:** zawężona akceptacja ryzyka `image-size` i kontrole
   kompensujące.
2. **Krok przejściowy A → B — zakończony:** usunięcie Trivy i SBOM z aktywnego procesu oraz
   odtworzenie manifestu kandydata.
3. **Faza B:** finalna certyfikacja dokładnego drzewa źródłowego, obrazów i Compose bez
   zmian funkcjonalnych.
4. **Faza C:** wyłącznie po osobnej zgodzie właściciela — przepisanie historii, pierwszy
   Conventional Commit, publikacja gałęzi, tag `v1.0.0` i GitHub Release.

Tag, GitHub Release i przepisanie historii nie są wykonywane automatycznie przez skrypty
repozytorium. Po zatwierdzeniu wyników można utworzyć tag:

```bash
git tag -s v1.0.0 -m "ZgłosTO 1.0.0"
git push origin main v1.0.0
```

Jeżeli historia ma zostać zastąpiona pojedynczym commitem bazowym, należy wykonać tę
operację przed utworzeniem taga. Jest to osobna, destrukcyjna decyzja wymagająca jawnego
potwierdzenia i `force-with-lease` dla zdalnej gałęzi `main`.

## Ograniczenia

- kod Mobile 1.0 jest gotowy, ale repozytorium nie dostarcza wspólnych buildów App Store ani
  Google Play; każdy klient buduje wariant dla własnej instancji i odpowiada za signing;
- profile `external` wymagają rzeczywistych usług S3/R2, Redis, OTLP lub LLM;
- certyfikacja konkretnego hosta produkcyjnego wymaga jego sekretów, DNS, TLS, backupu i
  testu odtworzenia;
- backend przypina i testuje oficjalne stabilne `@nestjs/*` `12.0.1`; prerelease'owy wyjątek
  peer dependency został usunięty 2026-09-02.

Pełny wykaz zmian znajduje się w głównym [CHANGELOG](../CHANGELOG.md), a procedury
operacyjne w [runbooku Docker Compose](production-compose-runbook.md).
