# Faza 8 / krok 14: lokalizacja zgłoszenia

## Status

Pierwotna warstwa Leaflet została wdrożona 2026-07-24, a następnie wycofana decyzją
produktową 2026-07-27. Publiczny formularz przyjmuje wyłącznie wymagany adres tekstowy.
Nie renderuje mapy, nie pobiera kafelków i nie pozwala mieszkańcowi przesyłać punktu.

Leaflet, React Leaflet, typy Leaflet, komponenty mapowe oraz tłumaczenia interaktywnej mapy
zostały usunięte z frontendu. Aktywne profile White-Label mają `features.map: false` oraz
`map: null`. Pola mapowe pozostają przejściowo w kontrakcie White-Label schema v1 i nullable
kolumnach incydentu wyłącznie dla zgodności danych; formularz wysyła dla współrzędnych
wartości `null`.

## Docelowy przepływ

- mieszkaniec podaje obowiązkowy adres tekstowy;
- administrator i użytkownik przypisany do służby widzą adres jako link;
- link otwiera Google Maps w trybie wyznaczania trasy z adresem i nazwą miasta jako celem;
- punkt startowy pozostaje niewskazany, dzięki czemu Google Maps może użyć bieżącej
  lokalizacji urządzenia albo poprosić użytkownika o jej podanie;
- używany jest standardowy Maps URL, bez osadzania mapy, klucza API, SDK, geokodowania
  w ZgłosTO ani dostępu Google do opisu, e-maila lub zdjęcia zgłoszenia;
- link otwiera się w nowej karcie/aplikacji z `rel="noopener noreferrer"`.

Publiczny widok mieszkańca nie otrzymuje dodatkowej integracji z Google Maps. Link jest
elementem operacyjnym paneli administracji i służb.

## Ograniczenia

Google Maps interpretuje adres dopiero po kliknięciu przez uprawnionego użytkownika.
ZgłosTO nie potwierdza automatycznie poprawności ani jednoznaczności adresu. W modelu jednej
instalacji dla jednego miasta do celu trasy dołączana jest skonfigurowana nazwa miasta, co
ogranicza ryzyko wskazania podobnego adresu w innej miejscowości.

Kontrakt używa:

```text
https://www.google.com/maps/dir/?api=1&destination=<zakodowany-adres-i-miasto>
```

Nie korzystamy z Directions API ani Maps JavaScript API, dlatego ta funkcja nie wymaga
projektu Google Cloud, billingu ani sekretu.
