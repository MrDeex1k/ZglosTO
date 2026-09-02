# Mobile readiness — iOS, iPadOS i Android

Stan audytu bazowego: 2026-08-19. Kod produktowy został od tego czasu ukończony. Dokument
pozostaje checklistą narzędziową dla klienta wykonującego własny build i wdrożenie; pozycje
dotyczące domen, signingów i sklepów nie blokują źródłowego wydania ZgłosTO.

Aktualna polityka wykonawcza od 2026-08-20: codzienne i checkpointowe testy są
uruchamiane wyłącznie na iPhone Simulator i Android Emulator. iPad oraz urządzenia
fizyczne pozostają w docelowej macierzy przedwydaniowej, ale wolno je uruchomić
dopiero na wyraźne polecenie właściciela projektu.

## 1. Stan stanowiska z audytu bazowego — 2026-08-19

| Obszar                   | Wynik audytu                                    | Ocena                                  |
| ------------------------ | ----------------------------------------------- | -------------------------------------- |
| Mac                      | MacBook Pro M4 Pro, 24 GB RAM                   | gotowy                                 |
| Dysk                     | około 284 GiB wolnego miejsca                   | gotowy                                 |
| macOS                    | 26.6                                            | gotowy                                 |
| Xcode                    | 26.6, Command Line Tools wskazują aktywne Xcode | gotowy dla Expo SDK 57                 |
| Xcode first launch       | zakończony poprawnie                            | gotowy                                 |
| iOS runtime              | 18.6 i 26.5                                     | gotowy                                 |
| iPhone Simulator         | wiele modeli, w tym małe i duże telefony        | gotowy                                 |
| iPad Simulator           | mini, 11 i 13 cali dla obu runtime'ów           | gotowy                                 |
| fizyczny iPhone          | iPhone 15 Pro dostępny do weryfikacji           | test po bootstrapie                    |
| fizyczny iPad            | brak                                            | potrzebny przed zewnętrzną betą        |
| Node.js                  | 26.5.0, zgodny z ówczesnym monorepo             | instalacja SDK 57 i narzędzia działają |
| PNPM/NPX                 | dostępne                                        | gotowy                                 |
| Watchman                 | dostępny                                        | gotowy                                 |
| CocoaPods                | 1.17.0                                          | gotowy                                 |
| Android Studio           | zainstalowane                                   | gotowy                                 |
| Android SDK/ADB/emulator | ADB 37.0.1, uruchomiony emulator ARM64          | gotowy                                 |
| Java                     | Zulu OpenJDK 17.0.20                            | gotowy dla Gradle                      |
| EAS CLI                  | niewymagane                                     | buildy są lokalne                      |

Expo SDK 57 jest stabilnym punktem odniesienia projektu. Aplikacja celowo podnosi
minimum platform do iOS/iPadOS 17.0 oraz Android API 31. Node 26.5 przeszedł historyczny
audyt bazowy. Od 2026-09-02 repozytorium wymaga Node.js `26.8.1`; obrazy i pełna integracja
zostały na nim zweryfikowane, a lokalne stanowisko należy zaktualizować przed kolejnym
testem Mobile.

## 2. Decyzje, które muszą zapaść przed bootstrapem

- [x] minimalna wersja iOS/iPadOS: 17.0;
- [x] minimalna wersja Androida: Android 12 / API 31; compile/target zgodne z SDK 57;
- [ ] iPhone: portrait oraz zasady landscape;
- [ ] iPad: portrait, landscape, Split View, Stage Manager i resize;
- [ ] czy Android obejmuje od pierwszego wydania telefony i tablety;
- [ ] czy iPad ma ten sam zakres funkcji co iPhone;
- [ ] zakres offline: odczyt cache czy również trwałe drafty;
- [ ] wymagane uprawnienia: aparat, biblioteka zdjęć i ewentualna lokalizacja;
- [ ] identyfikatory aplikacji: iOS bundle ID i Android application ID;
- [ ] nazwa aplikacji, scheme deep linków i domena universal/app links;
- [x] konto Expo istnieje; Apple Developer Program i Google Play nie są obecnie
      wymagane, ponieważ buildy oraz testy są lokalne;
- [ ] środowiska development, preview i production oraz ich publiczne originy API;
- [x] pierwsza wersja obejmuje mieszkańca i służby; admin pozostaje poza v1.

Nie należy rozpoczynać masowej implementacji ekranów przed zamknięciem identyfikatorów,
minimalnych systemów, auth/deep links i publicznego środowiska testowego.

## 3. Bramka Apple

### Narzędzia

- [x] Xcode i Command Line Tools;
- [x] co najmniej dwa runtime'y iOS;
- [x] symulatory iPhone oraz iPad;
- [x] zapewnić działające CocoaPods dla lokalnego `expo run:ios`/prebuild;
- [x] wykonać czysty build development clienta na iPhone Simulator;
- [x] wykonać ten sam build na iPad Simulator — iPad Pro 11″, 2026-08-19;
- [ ] wykonać build Release na generic iOS Simulator, aby wykryć problemy inne niż debug.

### Fizyczny iPhone

- [ ] podłączyć lub udostępnić przez Wi-Fi i odblokować urządzenie;
- [ ] potwierdzić Trust This Computer i widoczność w Xcode Device Hub;
- [ ] włączyć Developer Mode;
- [ ] potwierdzić zgodność systemu telefonu z Xcode;
- [ ] uruchomić development build podpisany dla tego urządzenia;
- [ ] sprawdzić aparat, photo picker, SecureStore/Keychain, deep link, słabą sieć,
      background/foreground i zimny start;
- [ ] powtórzyć instalację po usunięciu aplikacji, aby sprawdzić zachowanie Keychain.

Podczas audytu urządzenie `iPhone Jakub` było sparowane, ale niedostępne. Sam wpis w
Device Hub nie jest jeszcze dowodem gotowości.

### iPadOS

- [ ] uruchomić layout na iPad mini, 11 i 13 cali;
- [ ] sprawdzić portrait i landscape;
- [ ] sprawdzić dynamiczny resize, Split View i Stage Manager;
- [ ] sprawdzić klawiaturę sprzętową, skróty, pointer/trackpad i focus;
- [ ] potwierdzić `supportsTablet` oraz brak wymuszania pełnego ekranu bez decyzji;
- [ ] pozyskać fizycznego iPada przed zewnętrzną betą.

Symulator wystarcza do layoutu i większości logiki. Nie zastępuje kamery, realnej
pamięci, termiki, klawiatury/pointera ani zachowania multitaskingu na sprzęcie.

### Konta i podpisywanie

- [ ] Apple Account zespołu widoczny w Xcode;
- [ ] aktywne członkostwo Apple Developer Program przed instalacją development builda
      przez EAS na urządzeniu i przed TestFlight;
- [ ] dostęp do App Store Connect z odpowiednią rolą;
- [ ] zarezerwowany bundle ID i capabilities;
- [ ] właściciel certyfikatów, provisioning profiles i procesu rotacji;
- [ ] wewnętrzna grupa TestFlight i procedura dodawania testerów.

## 4. Bramka Android

Brak fizycznego Androida nie blokuje bootstrapu. Lokalny toolchain i emulator ARM64
są dostępne.

### Instalacja i konfiguracja

- [x] używać JDK 17 dla buildów Android;
- [x] zainstalować Android Studio dla Apple Silicon;
- [x] zainstalować Android SDK Platform 36;
- [x] zainstalować Android SDK Build-Tools, Command-line Tools, Platform-Tools i
      Android Emulator;
- [x] potwierdzić lokalizację SDK w `~/Library/Android/sdk`;
- [x] potwierdzić dostęp do `adb` oraz `emulator`;
- [x] potwierdzić `java -version`, `adb version`, `emulator -version` i akceptację
      licencji SDK;
- [ ] potwierdzić podczas builda, że Gradle używa JDK 17.

### Macierz emulatorów

- [x] telefon ARM64 z API 36 (`Pixel_9`);
- [ ] telefon z najstarszą wspieraną wersją Androida;
- [ ] Pixel Tablet lub równoważny emulator large-screen;
- [ ] co najmniej jeden wariant z małą pamięcią/ograniczonym CPU;
- [ ] test portrait, landscape, edge-to-edge, predictive back i klawiatury ekranowej;
- [ ] test odmowy i ponownego nadania uprawnień aparatu/zdjęć.

### Brak fizycznego urządzenia

- emulator wystarcza do codziennego developmentu i większości CI;
- przed zakończeniem checkpointu trzeba wykonać test na co najmniej jednym fizycznym
  Androidzie;
- przed produkcją potrzebny jest co najmniej jeden realny telefon klasy średniej lub
  słabszej, nie tylko flagowiec;
- jeśli zakup/wypożyczenie nie jest możliwe, użyć kontrolowanego device farmu, ale
  aparat, upload terenowy, powiadomienia i zachowanie sieci nadal warto sprawdzić
  osobiście.

## 5. Bramka Expo i monorepo

- [x] potwierdzić Expo SDK 57 jako stabilny baseline w dniu bootstrapu;
- [x] utworzyć minimalny projekt Expo Router w `Mobile` bez funkcji domenowych;
- [x] dodać `Mobile` do jednego PNPM workspace i zachować jeden lockfile;
- [x] historycznie: sprawdzić Node 26.5 z instalacją, Metro i lokalnymi buildami;
- [ ] powtórzyć instalację, Metro i lokalne buildy Mobile na wymaganym Node `26.8.1`;
- [ ] jeśli Expo lub zależność wymaga LTS, rozstrzygnąć wersję Node dla całego
      workspace zamiast ukrywać drugi runtime w skryptach;
- [x] potwierdzić import `@zglosto/contracts` oraz `@zglosto/i18n` przez Metro w obu
      lokalnych buildach;
- [x] uruchomić Expo Doctor bez błędów — 21/21 kontroli przeszło 2026-08-19;
- [ ] zacząć od development buildów z `expo-dev-client`; Expo Go służy tylko do
      krótkiego smoke testu;
- [x] udokumentować brak EAS Build na obecnym etapie;
- [x] potwierdzić, że wszystkie buildy są lokalne;
- [x] przypiąć wersje zależności dokładnie zgodnie z polityką repozytorium;
- [x] potwierdzić NativeWind 4.2.6 z Tailwind CSS 3.4.19 na Expo SDK 57; linia v5
      pozostaje odroczona, dopóki jest pre-release;
- [x] dodać tylko potrzebne, source-owned komponenty inspirowane React Native
      Reusables; obecny zestaw nie wymaga RN Primitives ani portali.

## 6. Bramka backendu i środowiska testowego

Fizyczny telefon nie może używać webowego `localhost` ani wewnętrznych adresów usług.
Przed budową ekranów należy zapewnić:

- [ ] publiczny lub bezpiecznie tunelowany HTTPS origin dla developmentu;
- [ ] poprawny certyfikat zaufany przez urządzenia, bez wyłączania TLS validation;
- [ ] `/api/config/public`, publiczny feed, auth i media dostępne przez jeden edge;
- [ ] `@better-auth/expo`, trusted origins/scheme i jawny transport cookie;
- [ ] konta testowe mieszkańca, służby i admina z kontrolowanymi danymi;
- [ ] deep link weryfikacji e-maila z fallbackiem web;
- [ ] presigned upload działający z URI urządzenia i SHA-256;
- [ ] prywatne zdjęcia pobierane z autoryzacją i czyszczone po wylogowaniu;
- [ ] correlation ID oraz logi bez PII;
- [ ] osobne dane i sekrety development/preview/production.

## 7. Pierwszy techniczny checkpoint

Zanim powstanie pełne UI, minimalna aplikacja musi udowodnić:

1. start na iPhone Simulator; — wykonane 2026-08-19
2. start na iPad Simulator — iPad Pro 11″ wykonany; drugi rozmiar i resize pozostają;
3. start na Android phone emulator; — wykonane 2026-08-19
4. start na Android tablet emulator;
5. instalację development builda na fizycznym iPhonie;
6. pobranie i walidację White-Label; — wykonane 2026-08-19
7. import współdzielonych contracts/i18n; — wykonane 2026-08-19
8. logowanie, restart aplikacji, odtworzenie sesji i wylogowanie;
9. deep link;
10. wybór zdjęcia, aparat na iPhonie, checksum, presigned PUT i utworzenie testowego
    zgłoszenia;
11. loading, offline, retry i `401/403`;
12. podstawowy test VoiceOver i TalkBack.

Checkpoint jest zakończony dopiero wtedy, gdy ten sam commit przechodzi na iOS,
iPadOS i Androidzie. Brak fizycznego Androida należy jawnie oznaczyć jako ograniczenie,
nie jako zaliczony test.

## 8. Minimalna macierz testowa

| Platforma | Codziennie               | Przed checkpointem                        | Przed produkcją                          |
| --------- | ------------------------ | ----------------------------------------- | ---------------------------------------- |
| iPhone    | jeden aktualny simulator | iOS 18.6 i 26.5 + fizyczny iPhone 15 Pro  | mały i duży iPhone, fizyczny sprzęt      |
| iPadOS    | iPad 11                  | mini + 11 + 13, portrait/landscape/resize | co najmniej jeden fizyczny iPad          |
| Android   | aktualny phone emulator  | phone + tablet + starsze wspierane API    | fizyczny telefon średniej/słabszej klasy |

## 9. Kolejność prac przygotowawczych

1. Zamknąć decyzje platformowe, konta i identyfikatory.
2. Uruchomić fizycznego iPhone'a z Developer Mode.
3. Zainstalować CocoaPods i udowodnić pusty local iOS build.
4. Zainstalować JDK 17, Android Studio, SDK 36 i dwa AVD-y.
5. Udowodnić pusty local Android build. — wykonane
6. Utworzyć minimalny projekt Expo SDK 57 w monorepo. — wykonane
7. Udowodnić development client na czterech symulatorach/emulatorach oraz iPhonie.
8. Podłączyć staging HTTPS, auth, White-Label i media.
9. Wykonać pierwszy checkpoint techniczny.
10. Dopiero potem rozpocząć pionowe ekrany z `SCREENS.tsv`.

## Źródła

- [Expo SDK 57](https://expo.dev/changelog/sdk-57)
- [Konfiguracja Android Emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [Konfiguracja iOS Simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Środowisko dla fizycznego iPhone'a](https://docs.expo.dev/get-started/set-up-your-environment/?device=physical&mode=development-build&platform=ios)
- [Apple Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)
