# Faza 8 / krok 13: integracja White-Label we frontendzie

## Status

Krok został wdrożony 2026-07-24. Frontend nie utrzymuje osobnej konfiguracji miasta.
Publiczna projekcja jednego zwalidowanego YAML-a jest osadzana podczas buildu i przekształcana
na jeden typowany model odczytu.

## Przepływ konfiguracji

1. `WHITE_LABEL_CONFIG_FILE` wskazuje jeden YAML miasta dla całego deploymentu.
2. `@zglosto/white-label-config` odczytuje plik i waliduje go kontraktem
   `@zglosto/contracts`.
3. Vite osadza wyłącznie publiczną projekcję konfiguracji w artefakcie frontendu.
4. `frontend/src/config/white-label.ts` ponownie waliduje dane na granicy bundle.
5. `frontend/src/config/white-label-view.ts` tworzy jeden model prezentacyjny dla:
   - stabilnej tożsamości i lokalizowanej nazwy miasta;
   - logo oraz tekstu alternatywnego;
   - posortowanego katalogu aktywnych służb.

Backend i Authorization nadal ładują ten sam YAML bez pośrednictwa frontendu. Readiness
wszystkich obrazów zawiera tę samą wersję i checksum konfiguracji.

## Integracja UI

- Nagłówek pobiera lokalizowaną nazwę miasta z modelu White-Label.
- Komponent emblematu pobiera ścieżkę logo i lokalizowany tekst alternatywny z tego samego
  modelu.
- Formularze i panele korzystają ze wspólnie posortowanego katalogu służb oraz stabilnych
  `serviceKey`.
- Frontend nie projektuje ustawień mapy. Po decyzji z 2026-07-27 formularz używa wyłącznie
  adresu tekstowego, a aktywne profile mają `features.map: false` i `map: null`.
- Nazwa miasta z White-Label jest dołączana do celu linku Google Maps dostępnego w panelach
  administracji i służb.

## Testy regresji

Test frontendu ładuje rzeczywiste konfiguracje:

- ZgłosTO — nazwa, logo i kolejność służb;
- Wrocław — drugi profil miasta bez ujawniania nieużywanych ustawień mapy;
- Gdańsk — poprawny profil z mapą wyłączoną.

Istniejące testy buildów dwóch miast nadal sprawdzają, że ten sam kod frontendu działa z
różnymi konfiguracjami bez hardcode'u danych miasta.
