# Screenshoty Mobile

Wersjonowana galeria pokazuje lokalne demo na iPhone 17 Pro Simulator z iOS 26.5 oraz
Pixel 9 Android Emulator. Screenshoty wykonano 2026-08-25 przy użyciu `agent-device`.

## Galeria

| Platforma | Widok                                           | Plik                                                   |
| --------- | ----------------------------------------------- | ------------------------------------------------------ |
| Android   | publiczny feed rozwiązanych zgłoszeń            | [public-feed.png](android/public-feed.png)             |
| Android   | kolejka i filtry Zarządu Dróg                   | [service-dashboard.png](android/service-dashboard.png) |
| Android   | profesjonalnie wypełniony formularz ze zdjęciem | [report-with-photo.png](android/report-with-photo.png) |
| iOS       | szczegóły publicznego zgłoszenia                | [incident-details.png](ios/incident-details.png)       |
| iOS       | historia syntetycznej mieszkanki                | [resident-dashboard.png](ios/resident-dashboard.png)   |
| iOS       | granica roli administratora Mobile 1.0          | [admin-boundary.png](ios/admin-boundary.png)           |

## Zasady publikacji

- tylko dane syntetyczne i adresy w zastrzeżonej domenie `example.test`;
- bez tokenów, cookies, losowych haseł, logów, request ID i prywatnych danych urządzenia;
- bez przycisku Expo Tools, overlayów deweloperskich i nazw faz implementacyjnych;
- fotografie muszą mieć potwierdzone źródło i usunięte identyfikatory osób lub pojazdów;
- surowe ujęcia diagnostyczne pozostają w ignorowanym `output/` i nie trafiają do Git.

Załączona fotografia autobusu pochodzi od właściciela projektu i została zanonimizowana
przed użyciem. Pozostałych materiałów źródłowych z widoczną osobą lub podkładem mapowym
nie opublikowano.
