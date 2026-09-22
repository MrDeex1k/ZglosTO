# Pokrycie dokumentacji `/docs`

Ten audyt zestawia główne ścieżki bieżącego produktu z opublikowanymi przewodnikami.
Źródłem listy publikowanych stron jest [content-map.mjs](../docs-site/content-map.mjs),
a nie liczba plików w `docs/`. Status „opisane” oznacza, że istnieje użyteczna instrukcja
lub kontrakt, nie że każda kombinacja konfiguracji klienta przeszła test produkcyjny.

| Obszar produktu                              | Źródło w aplikacji lub repo                                                                                                                                                          | Strony `/docs`                                                                                                                                                              | Stan                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Publiczny feed, formularz i potwierdzenie    | [widok WEB](../frontend/src/components/AppViews.tsx), [formularz WEB](../frontend/src/components/IncidentForm.tsx), [przyjęcie](incident-acceptance.md)                              | [Mieszkaniec WEB](using-web-resident.md), [Przyjmowanie zgłoszeń](incident-acceptance.md)                                                                                   | opisane                                                  |
| Konto, e-mail i prywatna historia            | [panel WEB](../frontend/src/components/AppViews.tsx), [kontrakt API](api-contracts-baseline.md)                                                                                      | [Mieszkaniec WEB](using-web-resident.md), [Kontrakty API](api-contracts-baseline.md)                                                                                        | opisane                                                  |
| Kolejka i statusy służby WEB                 | [panel WEB](../frontend/src/components/AppViews.tsx), [szczegóły](../frontend/src/components/ServiceIncidentDialog.tsx)                                                              | [Służby WEB](using-web-service.md)                                                                                                                                          | opisane                                                  |
| Wszystkie sprawy, fallback i uprawnienia WEB | [panel administratora](../frontend/src/components/AdminPanel.tsx)                                                                                                                    | [Administrator WEB](using-web-admin.md), [Kontrakty API](api-contracts-baseline.md)                                                                                         | opisane                                                  |
| Publiczny obszar, formularz, konto Mobile    | [feed](../Mobile/src/screens/public-incidents-screen.tsx), [formularz](../Mobile/src/screens/report-incident-screen.tsx), [konto](../Mobile/src/screens/resident-account-screen.tsx) | [Mieszkaniec Mobile](using-mobile-resident.md), [Mobile: konfiguracja](../Mobile/CLIENT_CONFIGURATION.md)                                                                   | opisane                                                  |
| Kolejka i obsługa spraw Mobile               | [kolejka](../Mobile/src/screens/service-home-screen.tsx), [szczegóły](../Mobile/src/screens/service-incident-details-screen.tsx)                                                     | [Służby Mobile](using-mobile-service.md)                                                                                                                                    | opisane                                                  |
| Role, granice sesji i brak admina Mobile     | [kontrakt](api-contracts-baseline.md), [stan Mobile](../Mobile/CURRENT_STATE.md)                                                                                                     | [Administrator WEB](using-web-admin.md), [Mieszkaniec Mobile](using-mobile-resident.md), [Służby Mobile](using-mobile-service.md)                                           | opisane                                                  |
| Instalacja, White-Label i wybór wdrożenia    | [konfiguracja](white-label-configuration.md), [profile](deployment-selection.md)                                                                                                     | [Start](local-development.md), [Konfiguracja](white-label-configuration.md), [Wdrożenie](deployment-selection.md)                                                           | opisane                                                  |
| API, architektura i media                    | [granica frontendu](frontend-domain-boundary.md), [kontrakt mediów](media-processing-contract.md)                                                                                    | [Architektura](current-architecture-audit.md), [API](api-contracts-baseline.md), [Media](media-processing-contract.md), [Granice frontendu](frontend-domain-boundary.md)    | opisane                                                  |
| Utrzymanie, diagnostyka i odzyskiwanie       | [runbook](production-compose-runbook.md), [backup](backup-restore.md)                                                                                                                | [Compose](production-compose-runbook.md), [Diagnostyka](compose-smoke-tests.md), [Monitoring](observability.md), [Backup](backup-restore.md), [Obrazy](container-images.md) | opisane                                                  |
| K3s                                          | [profil](infrastructure-profiles.md), [import obrazów](k3s-local-images-handoff.md)                                                                                                  | [Kubernetes/K3s](infrastructure-profiles.md), [Obrazy dla K3s](k3s-local-images-handoff.md)                                                                                 | opisane jako profil opcjonalny, bez certyfikacji klienta |

## Świadomie poza `/docs`

- Raporty `phase-*`, historyczne wyniki migracji Bun, dowody wydania i roadmapa pozostają w
  Git. Są przydatne do audytu, ale nie są instrukcją bieżącego produktu.
- Sekrety, adresy i konfiguracja konkretnej instancji klienta nie należą do statycznej
  dokumentacji. Każdy klient ustala własną domenę i wykonuje własny odbiór wdrożenia.
- Natywny panel administratora Mobile nie istnieje w wersji 1.0; opisanie go jako funkcji
  byłoby błędem.

## Czego audyt nie potwierdza

Automatyczne `bun run check:docs` weryfikuje pliki, linki, typy, build, wyszukiwarkę i
trasowanie statyczne. Nie zastępuje sesji testowej wszystkich ról w działającej instancji,
testu produkcyjnego obrazu po zmianach ani odbioru z domeną i danymi klienta.
Przed scaleniem gałęzi uruchom te kontrole osobno. Po zmianie funkcji aplikacji najpierw
porównaj ten audyt z kodem, następnie aktualizuj kanoniczne przewodniki i
`content-map.mjs`.
