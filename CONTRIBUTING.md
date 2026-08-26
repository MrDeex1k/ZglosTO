# Współtworzenie ZgłosTO

Dziękujemy za zainteresowanie rozwojem ZgłosTO. Zgłoszenia błędów, propozycje zmian,
poprawki dokumentacji i kodu są mile widziane, o ile są przesyłane zgodnie z poniższymi
zasadami.

## Licencja projektu

ZgłosTO jest oprogramowaniem source-available udostępnianym na warunkach
[PolyForm Internal Use License 1.0.0](LICENSE). Nie jest oprogramowaniem open source w
rozumieniu Open Source Initiative.

Licencja pozwala używać i modyfikować ZgłosTO oraz tworzyć na jego podstawie wewnętrzne
rozwiązania na potrzeby własnej organizacji. Nie pozwala rozpowszechniać programu,
sublicencjonować go, sprzedawać ani świadczyć na jego podstawie usług podmiotom trzecim.

## Dodatkowe pozwolenie na przygotowanie wkładu

Niezależnie od uprawnień wynikających z PolyForm Internal Use License 1.0.0 licencjodawca
udziela niewyłącznego, nieodpłatnego i ogólnoświatowego pozwolenia na powielanie,
modyfikowanie oraz udostępnienie ZgłosTO wyłącznie w zakresie koniecznym do:

- utworzenia forka oficjalnego repozytorium `MrDeex1k/ZglosTO` na GitHubie;
- przygotowania zmiany przeznaczonej dla oficjalnego projektu;
- opublikowania tej zmiany w takim forku;
- przesłania, omówienia i zachowania jej jako issue lub pull request w oficjalnym
  repozytorium.

Pozwolenie nie obejmuje użycia forka w innym produkcie, eksploatacji produkcyjnej
wykraczającej poza PolyForm Internal Use, redystrybucji poza procesem współtworzenia,
sprzedaży, sublicencjonowania ani świadczenia usług podmiotom trzecim. Fork może pozostać
publiczny jako zapis wkładu, ale nie może być wykorzystywany do innych celów. Wszystkie
informacje o licencji i prawach autorskich muszą pozostać nienaruszone.

## Jak zgłaszać zmiany

- Błędy i niewrażliwe propozycje zgłaszaj przez GitHub Issues.
- Większą funkcję, zmianę architektury lub nową zależność omów w issue przed rozpoczęciem
  implementacji.
- Podatności zgłaszaj wyłącznie prywatnie zgodnie z [SECURITY.md](SECURITY.md).
- Pull request powinien rozwiązywać jeden spójny problem i wskazywać powiązane issue, jeśli
  istnieje.

Maintainer może odłożyć lub odrzucić zmianę, która nie pasuje do kierunku produktu,
niepotrzebnie rozszerza zakres, utrudnia weryfikację pochodzenia albo łączy niezwiązane
refaktory i formatowanie.

## Contributor License Agreement

Zewnętrzny wkład zawierający kod, dokumentację, konfigurację, schemat, grafikę lub inny
utwór może zostać połączony dopiero po zaakceptowaniu [CLA](CLA.md). Samo zgłoszenie błędu
lub pomysłu, które nie przekazuje chronionego utworu, nie wymaga CLA.

W obecnym procesie kontrybutor akceptuje CLA, publikując w pull requeście dokładny komentarz:

```text
I have read and agree to the ZgłosTO Contributor License Agreement in CLA.md.
```

Maintainer może poprosić o dodatkowe potwierdzenie tożsamości, autorstwa, zgody pracodawcy
lub pochodzenia wkładu. Do czasu wyjaśnienia tych kwestii przegląd albo połączenie PR może
zostać wstrzymane.

## Środowisko developerskie

Repozytorium wymaga Node.js `>=26.5.0` i PNPM `11.22.0`. Zależności JavaScript są
instalowane przez Socket Firewall i podlegają 24-godzinnej kwarantannie publikacji.

```bash
pnpm install --frozen-lockfile
pnpm certs:dev
```

Po pierwszym bootstrapie używaj chronionych poleceń:

```bash
pnpm deps:install
pnpm deps:add -- <pakiet>
pnpm deps:update
```

Instrukcje uruchomienia Docker Compose i pozostałych profili znajdują się w
[README](README.md).

## Kontrole jakości

Przed otwarciem pull requesta uruchom pełną bramkę repozytorium:

```bash
pnpm check
```

Jeśli zmiana dotyczy API, bazy, autoryzacji, brokera, Object Storage, zdjęć, LLM,
konfiguracji Compose albo komunikacji między usługami, uruchom również:

```bash
pnpm test:integration
```

`pnpm check` obejmuje polityki źródeł i wdrożeń, OxFmt, OxLint, TypeScript, testy Vitest,
testowe buildy White-Label i zadania zarządzane przez Turborepo. Zmiana zachowania,
konfiguracji, zmiennych środowiskowych lub procesu wdrożenia musi aktualizować właściwą
dokumentację w tym samym PR.

## Commity

Commity muszą być zgodne z Conventional Commits. Format sprawdzają Husky i Commitlint.

```text
feat(frontend): improve incident form
fix(backend): validate image metadata
docs(security): clarify reporting policy
```

Każdy commit i pull request powinien być możliwie mały, logicznie spójny oraz pozbawiony
niepowiązanych zmian.

## Sekrety, dane i materiały zewnętrzne

Nigdy nie umieszczaj w issue, PR, commitach, logach, przykładach ani zrzutach ekranu:

- prawdziwych plików `.env`, haseł, tokenów i kluczy API;
- kluczy prywatnych i produkcyjnych certyfikatów;
- danych mieszkańców, pracowników albo administratorów;
- rzeczywistych zgłoszeń, adresów, wiadomości e-mail i zdjęć;
- materiałów objętych cudzą licencją, poufnością lub tajemnicą przedsiębiorstwa.

Używaj wyłącznie sztucznych danych oraz wersjonowanych plików `*.example`.

## Kod tworzony z pomocą AI

Narzędzia AI mogą wspierać pracę, ale kontrybutor pozostaje odpowiedzialny za poprawność,
bezpieczeństwo, testy i legalne pochodzenie całego wkładu. Istotne użycie kodu generowanego
przez AI należy ujawnić w opisie PR. Nie wolno przesyłać materiału, do którego kontrybutor
nie może udzielić praw wymaganych przez CLA.

## Lista kontrolna pull requesta

Przed wysłaniem PR upewnij się, że:

- zmiana ma jasny cel i wskazuje powiązane issue, jeśli ma to zastosowanie;
- dokumentacja i przykładowe konfiguracje są aktualne;
- `pnpm check` oraz wymagane testy integracyjne przeszły;
- commity są zgodne z Conventional Commits;
- PR nie zawiera sekretów ani danych osobowych;
- źródło każdego elementu wkładu jest znane i legalne;
- zaakceptowano CLA, jeśli jest wymagane.
