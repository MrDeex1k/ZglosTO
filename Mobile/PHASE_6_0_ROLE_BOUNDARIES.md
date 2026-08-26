# Faza 6.0 — granice ról Mobile 1.0

Data decyzji: 2026-08-25.

## Decyzja produktowa

W wersji 1.0 aplikacja mobilna nie zawiera Panelu Administratora. Administrator
zalogowany w aplikacji na telefonie lub tablecie widzi wyłącznie informację, że do
zarządzania systemem wymagany jest komputer, oraz akcję wylogowania. Ekran nie
zawiera linku ani akcji otwierającej panel WEB.

Pozostałe funkcje administracyjne Fazy 6 są oznaczone jako `SKIPPED / OUT OF SCOPE`.
Nie zmienia to funkcjonalnego zakresu Panelu Administratora WEB ani autoryzacji backendowej.
Pełny panel WEB pozostaje dostępny na komputerze; klient WEB na rozpoznanym telefonie lub
tablecie pokazuje analogiczny komunikat o wymaganym komputerze. Ta blokada WEB jest
ograniczeniem UX i może zostać ominięta przez tryb desktopowy lub zmianę sygnałów
przeglądarki.

## Macierz dostępu

| Sesja               | Publiczny feed i szczegóły | Formularz mieszkańca | Panel mieszkańca | Panel służb | Start Mobile                  |
| ------------------- | -------------------------- | -------------------- | ---------------- | ----------- | ----------------------------- |
| anonimowa           | tak                        | według White-Label   | nie              | nie         | feed publiczny                |
| mieszkaniec         | tak                        | tak                  | tak              | nie         | feed publiczny                |
| służby              | nie                        | nie                  | nie              | tak         | przekierowanie do służb       |
| administrator       | nie                        | nie                  | nie              | nie         | komunikat „wymagany komputer” |
| rola nieobsługiwana | nie                        | nie                  | nie              | nie         | komunikat i wylogowanie       |

Każdy endpoint nadal egzekwuje rolę niezależnie od routingu klienta.

## Inwarianty implementacji

- tylko sesja anonimowa albo rola mieszkańca może zamontować komponent feedu;
- zablokowana rola nie montuje `useQuery` publicznych zgłoszeń i nie wykonuje
  wynikającego z niego requestu;
- root, publiczne szczegóły, formularz, ustawienia, kontakt i informacje prawne są
  objęte tą samą granicą ról;
- pracownik otwierający root lub publiczny deep link trafia do `/service`;
- administrator otwierający root lub dowolny publiczny deep link trafia do komunikatu
  na `/`;
- odtworzenie sesji po cold starcie stosuje tę samą politykę przed pokazaniem danych;
- zmiana roli lub użytkownika nadal czyści prywatne query i robocze media.

## Siedem kroków zamykających

1. Centralna macierz dostępu w `auth/route-access.ts`.
2. Warunek montowania publicznego feedu przed jego query.
3. Stałe przekierowanie służby do jej panelu.
4. Ekran administratora bez linku WEB, z jedyną akcją wylogowania.
5. Ochrona publicznych szczegółów, formularza oraz deep linków.
6. Test cold startu, odtworzenia sesji, deep linku i wylogowania na aktywnej macierzy.
7. Testy automatyczne, dokumentacja i checkpoint przed Fazą 7.

## Aktywna macierz urządzeń

- Pixel 9 Android Emulator;
- iPhone 17 Pro Simulator z iOS 26.5.

Urządzenia fizyczne, iPad oraz starsze systemy pozostają zakresem Fazy 7.

## Wynik checkpointu

**PASS / CONTINUE — 2026-08-25.** Oba scenariusze Maestro przeszły na Pixelu 9
Android Emulator oraz iPhonie 17 Pro Simulator z iOS 26.5. Zweryfikowano:

- logowanie jako administrator i pracownik;
- brak montowania publicznego feedu w obu zablokowanych rolach;
- komunikat administratora bez linku WEB i z jedyną akcją wylogowania;
- przekierowanie pracownika do Panelu Służb;
- publiczny deep link bez ujawnienia feedu ani szczegółów;
- odtworzenie właściwego obszaru po zatrzymaniu procesu i cold starcie;
- powrót do publicznego feedu po wylogowaniu.

Test używa losowego, jednorazowego konta `phase6.role.*@example.test`. Skrypt ma
blokadę lokalnego środowiska, zmienia wyłącznie to konto i usuwa je również po błędzie.
Cloudflared nie jest wymagany ani uruchamiany przez checkpoint.
