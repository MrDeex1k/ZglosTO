# Aktualny stan ZgłosTO Mobile

Snapshot: **2026-08-25, po zamknięciu Fazy 7**.

Ten dokument jest punktem startowym przy wznowieniu prac. Szczegółową historię i
uzasadnienia zachowują dokumenty fazowe oraz [ROADMAP.md](ROADMAP.md).

## Decyzja checkpointu

**SOURCE READY / CLIENT-BUILT / NOT STORE-PUBLISHED.** Kod aplikacji, lokalne demo,
materiały, regresja aktywnej macierzy oraz handoff klienta są gotowe. ZgłosTO nie dostarcza
centralnych binariów App Store/Google Play: każdy licencjonowany klient buduje, podpisuje,
wdraża i utrzymuje własny wariant aplikacji połączony z własną instancją systemu.

Fazy zakończone:

- Faza 0–2: bootstrap Expo i fundament techniczny;
- Faza 3: API, auth, media, formularz, szczegóły, służby i deep linki;
- Faza 4: kompletne MVP mieszkańca;
- Faza 5: kompletny zakres pracownika służb;
- Faza 6.0: rozłączne granice ról Mobile 1.0;
- Faza 7: Source Ready / Client-Built, z krokami 7.5 i 7.7 uznanymi za niewymagane w
  przyjętym modelu dystrybucji.

Kroki 6.1–6.9, czyli natywny Panel Administratora, mają status
`SKIPPED / OUT OF SCOPE dla 1.0`.

## Zakres ról w wersji 1.0

| Sesja               | Dozwolony obszar Mobile                                             |
| ------------------- | ------------------------------------------------------------------- |
| anonimowa           | publiczny feed, publiczne szczegóły i zgłoszenie według White-Label |
| mieszkaniec         | publiczny obszar oraz Panel Mieszkańca                              |
| pracownik służb     | wyłącznie Panel Służb                                               |
| administrator       | wyłącznie komunikat o wymaganym komputerze i wylogowanie            |
| rola nieobsługiwana | komunikat bez danych i wylogowanie                                  |

Administrator nie otrzymuje w aplikacji mobilnej linku do WEB ani dostępu do Panelu
Mieszkańca. Pracownik nie może otworzyć feedu publicznego, szczegółów ani formularza
mieszkańca. Polityka obejmuje root, deep linki, cold start i odtworzenie sesji.

## Aktualny stack i wersje

- Expo SDK `57.0.16`;
- React Native `0.86.2` i React `19.2.3`;
- Expo Router `57.0.16`;
- NativeWind `4.2.6` i Tailwind CSS `3.4.19`;
- TanStack Query `5.101.4`;
- Better Auth oraz `@better-auth/expo` `1.6.29`;
- współdzielone `@zglosto/contracts` i `@zglosto/i18n`;
- lokalne development buildy, bez EAS i bez analityki.

Minimalne platformy pozostają bez zmian: iOS/iPadOS 17 oraz Android 12 / API 31.

## Licencja i zasady repozytorium

Mobile jest częścią jednego produktu i nie ma osobnych zasad prawnych ani procesu
współtworzenia. Tak samo jak WEB i pozostałe komponenty podlega głównym plikom
[LICENSE](../LICENSE), [SECURITY.md](../SECURITY.md), [CONTRIBUTING.md](../CONTRIBUTING.md),
[CLA.md](../CLA.md) oraz konfiguracji `.github/`.

Obowiązuje PolyForm Internal Use License 1.0.0, prywatne zgłaszanie podatności, wspólny
proces Issues/PR, CLA dla zewnętrznego wkładu, Conventional Commits, ujawnianie istotnego
użycia AI oraz wspólne bramki jakości i zależności. Pomysły i niewrażliwe propozycje są
zgłaszane w GitHub Issues; Mobile nie otrzyma kopii tych dokumentów, aby nie tworzyć
rozbieżnych źródeł prawdy.

Licencja pozwala na użycie wewnętrzne zgodnie z jej warunkami. Każdy klient odpowiada za
własne wdrożenie i nie otrzymuje prawa do redystrybucji, sublicencjonowania, sprzedaży ani
świadczenia ZgłosTO jako usługi podmiotom trzecim.

## Model dostarczenia klientowi

- repozytorium źródłowe jest wspólnym artefaktem produktu;
- jedna instalacja obsługuje jedno miasto i jeden wariant White-Label;
- każdy klient posiada własny backend, bazę, Object Storage, konfigurację i sekrety;
- klient wykonuje lokalne buildy Mobile oraz zarządza bundle ID/application ID i signingiem;
- konta Apple Developer/Google Play są wymagane wyłącznie wtedy, gdy klient wybierze
  publikację w odpowiednim sklepie;
- brak centralnych buildów i wspólnej instancji SaaS jest decyzją produktową, a nie brakiem
  implementacji Mobile.

## Ostatnia weryfikacja

Kroki 7.0–7.3 przeszły lokalnie na OrbStack:

- skan publikowalności: 964 pliki, governance, ścieżki, worktree i historia Git — `PASS`;
- dwa syntetyczne warianty White-Label oraz ich frontendowe buildy — `PASS`;
- Quick Start: build obrazów, 10/10 zdrowych usług, healthcheck, public config i seed —
  `PASS`;
- credentials miały prawa `0600`, po czym `mobile:demo:clean` usunął projekt, wolumeny i
  plik lokalny;
- lint, typecheck, wszystkie testy i build monorepo — `PASS`;
- Mobile: 30 plików testowych / 132 testy, export Android+iOS i Expo Doctor 21/21 — `PASS`.

Krok 7.4 zakończył się wynikiem `PASS`:

- seed zawiera profesjonalne, syntetyczne konta i osiem realistycznych incydentów;
- sześć bezpiecznych publikacyjnie screenshotów obejmuje iOS, Androida i wszystkie
  granice ról;
- główny README, galeria i scenariusz demonstracyjny są gotowe do portfolio;
- żaden materiał nie zawiera badge'a fazy, technicznej nazwy incydentu, hasła ani
  identyfikującego zdjęcia.

Kroki 7.6, 7.8 i 7.9 zamknęły Fazę 7:

- finalny zestaw agent-device/Maestro przeszedł 3/3 na Pixel 9 w 148,9 s i 3/3 na
  iPhone 17 Pro / iOS 26.5 w 235,9 s;
- seed używa stałych UUID-ów i potwierdza publiczny deep link bez technicznych nazw;
- lint, TypeScript, 132/132 testy, Expo Doctor 21/21, skan 983 plików oraz dwa warianty
  White-Label mają wynik `PASS`;
- izolowana kopia bez `.git` i `node_modules` przeszła offline frozen install,
  `mobile:demo:check`, automatyczny build pakietów współdzielonych, typecheck i 132 testy;
- [CLIENT_HANDOFF.md](CLIENT_HANDOFF.md) opisuje konfigurację, utrzymanie i drogę do
  produkcji;
- [PHASE_7_CHECKPOINT.md](PHASE_7_CHECKPOINT.md) zapisuje decyzję bez tagu i release'u.

GitHub Actions dla buildów Mobile (7.5) oraz osobny binarny artefakt demo (7.7) pozostają
`NOT REQUIRED`. Klient może dodać własną automatyzację, ale nie jest ona częścią
referencyjnego procesu dostarczenia.

Poprzedni checkpoint urządzeniowy Fazy 6.0 przeszedł na:

- Pixel 9 Android Emulator;
- iPhone 17 Pro Simulator z iOS 26.5.

Zweryfikowano logowanie Admina i Pracownika, izolację danych, publiczne deep linki,
cold start, odtworzenie sesji i wylogowanie. Końcowe development buildy Androida i
iOS zakończyły się powodzeniem.

Stan automatycznych bramek:

- Mobile: 30 plików testowych i 132 testy — `PASS`;
- TypeScript i lint — `PASS`;
- Expo Doctor — `21/21`;
- React Doctor — bez błędów; 6 ostrzeżeń utrzymaniowych poza zmianą granic ról;
- lint, typecheck, testy, White-Label builds i build całego monorepo — `PASS`;
- pełną bramkę repozytorium należy uruchomić ponownie po końcowym porządkowaniu dokumentacji
  i przed utworzeniem nowej historii Git oraz taga.

Jednorazowe konta `phase6.role.*@example.test` zostały usunięte. Skrypt E2E usuwa
fixture także po błędzie.

## Stan środowiska po checkpointcie

Izolowane kontenery, wolumeny i credentials `zglosto-mobile-demo` zostały usunięte po
weryfikacji. Inne projekty Compose nie zostały zmienione przez cleanup. Metro, Pixel 9
Android Emulator i iPhone 17 Pro Simulator zostały wyłączone po końcowej regresji.
Cloudflared nie był potrzebny i nie został uruchomiony.

Testy na fizycznym iPhonie, iPadzie, starszym iOS oraz fizycznym Androidzie nie należą do
bieżącej macierzy i wymagają jawnej decyzji. Stan procesów jest informacją operacyjną z
chwili zapisu, a nie wymaganiem trwałym; przed następną sesją należy sprawdzić go ponownie.

## Następny etap

Nie rozpoczynamy teraz Fazy 8 Mobile ani centralnego release'u sklepowego. Następny proces
obejmuje cały produkt: audyt i porządki kompletnego codebase'u, konsolidację dokumentacji,
pełną bramkę jakości, utworzenie spójnego release candidate, a następnie — po osobnej,
jawnej zgodzie właściciela — zastąpienie historii Git jednym committem bazowym i publikację
źródłowego wydania. Automatyczne buildy Mobile nie są warunkiem tego procesu.

Najważniejsze pozostałe ograniczenia:

- brak stałej domeny i produkcyjnego hosta dla Universal Links/App Links;
- brak testów na fizycznych urządzeniach i iPadzie w bieżącym checkpointcie;
- brak kont i konfiguracji publikacyjnej Apple/Google, które zapewnia dopiero klient
  decydujący się na dystrybucję sklepową;
- brak zaakceptowanego crash reportingu i deklaracji prywatności sklepów;
- aplikacja nie przeszła pełnej macierzy produkcyjnej ani procesu beta.

Te ograniczenia dotyczą konkretnego wdrożenia klienta lub jego dystrybucji sklepowej. Nie
podważają bieżącej decyzji `SOURCE READY / CLIENT-BUILT / NOT STORE-PUBLISHED`.

## Dokumenty źródłowe

- [PHASE_6_0_ROLE_BOUNDARIES.md](PHASE_6_0_ROLE_BOUNDARIES.md) — decyzja i dowody Fazy 6.0;
- [PHASE_6_ACCEPTANCE.tsv](PHASE_6_ACCEPTANCE.tsv) — macierz akceptacyjna;
- [PHASE_7_6_VERIFICATION.md](PHASE_7_6_VERIFICATION.md) — finalna regresja urządzeń;
- [CLIENT_HANDOFF.md](CLIENT_HANDOFF.md) — przekazanie i droga do produkcji;
- [PHASE_7_CHECKPOINT.md](PHASE_7_CHECKPOINT.md) — końcowa decyzja Fazy 7;
- [ROADMAP.md](ROADMAP.md) — następne fazy;
- [DEPENDENCIES.tsv](DEPENDENCIES.tsv) — zatwierdzone zależności;
- [READINESS_CHECKLIST.md](READINESS_CHECKLIST.md) — bramki sprzętowe i wydaniowe;
- [RISKS_AND_DECISIONS.md](RISKS_AND_DECISIONS.md) — otwarte ryzyka i decyzje.
