# Weryfikacja kroku 3.5 — zgłoszenie ze zdjęciem

Data: 2026-08-20

## Zakres

Krok 3.5 dodaje do formularza mieszkańca i użytkownika anonimowego jedno opcjonalne
zdjęcie. Implementacja obejmuje bibliotekę i aparat, podgląd i usunięcie zdjęcia,
walidację MIME oraz limitu 5 MiB, lokalny SHA-256, inicjację presigned uploadu,
binarny PUT bez base64, postęp, AbortSignal, retry oraz przekazanie `uploadId` dopiero
po udanym uploadzie.

Nie testowano iPada ani fizycznego iPhone'a zgodnie z bieżącą polityką projektu.

## Implementacja

- `expo-image-picker` 57.0.11 — biblioteka i aparat;
- `expo-file-system` 57.0.4 — rozmiar, bytes i natywny binary PUT z postępem;
- `expo-crypto` 57.0.1 — SHA-256 w lowercase hex;
- wspólne kontrakty `InitiateImageUpload*` i `CurrentCreateIncident*`;
- dozwolone typy: JPEG, PNG, GIF i WebP;
- limit: `INCIDENT_IMAGE_MAX_BYTES`, czyli 5 MiB;
- retry ponawia checksum → inicjację → PUT → create i nie tworzy incydentu po
  nieudanym PUT;
- anulowanie przerywa inicjację, PUT lub create przez jeden `AbortController`;
- aplikacja nie tworzy własnej kopii tymczasowej ani nie zapisuje obrazu w cache
  aplikacyjnym.

Config plugin zawiera polskie opisy `NSCameraUsageDescription` i
`NSPhotoLibraryUsageDescription`, a dostęp do mikrofonu jest wyłączony.

## Lokalny transport storage

Android nie rozwiązuje wildcardu `uploads.localhost`. Lokalny publiczny endpoint S3
został dlatego ustawiony na `http://uploads.127.0.0.1.nip.io:1235`. Host rozwiązuje
się do loopback na obu platformach i zachowuje podpis AWS. Android Emulator używa:

```bash
adb reverse tcp:1235 tcp:1235
```

Ograniczony proxy API na `127.0.0.1:18135` dopuszcza tylko potrzebne trasy, w tym
`POST /api/mieszkaniec/obrazy/uploads`. Podpisany PUT omija proxy API i trafia do
osobnego hosta uploadowego Nginx.

## Wynik Android Emulator

Na Pixel 9 / Android API 37 wykonano pełny przepływ:

1. wybór PNG przez systemowy photo picker;
2. podgląd i metadane pliku w formularzu;
3. inicjacja uploadu — HTTP `201`;
4. podpisany PUT z wymaganym `Content-Length`, MIME i checksum — HTTP `200`;
5. utworzenie zgłoszenia z `uploadId` — HTTP `201`;
6. ekran sukcesu, numer `01a01fe5-4875-7f53-8c9f-492ad952ee0c`;
7. media worker — `media_worker.image.succeeded`, wynik `applied`.

Pierwsza próba ujawniła niezgodny host `uploads.localhost`. Formularz i zdjęcie
pozostały w pamięci, a po zmianie endpointu przycisk retry zakończył cały przepływ
bez ponownego wprowadzania danych. Backend nie otrzymał create po nieudanym PUT.

## Wynik iPhone Simulator

Na iPhone 16 Pro Simulator / iOS 18.6 potwierdzono:

- finalny build, instalację, uruchomienie i aktualny bundle Fazy 3.5;
- natywne podpięcie ExpoImagePicker, ExpoFileSystem i ExpoCrypto;
- obecność opisów aparatu i biblioteki w zbudowanym `Info.plist`;
- działający formularz i połączenie z lokalnym API.

Interakcja z systemowym pickerem i wykonanie zdjęcia na iOS nie zostały
zautomatyzowane. Aparat wymaga późniejszego testu na fizycznym iPhonie, ale zgodnie
z decyzją D-16 nie jest teraz uruchamiany.

## Bramki jakości

- Mobile: 17 plików testowych, 58 testów;
- Mobile typecheck i lint: zaliczone;
- pełne `pnpm check` monorepo, wraz z testami, buildami i eksportem Android/iOS:
  zaliczone;
- React Doctor: brak nowych problemów; pozostało 5 wcześniejszych ostrzeżeń o
  ręcznej memoizacji w providerach;
- Expo Doctor: 20/21; osiem nowych patchy Expo pozostaje czasowo zablokowanych przez
  politykę `minimumReleaseAge`, nie przez niezgodność użytych modułów;
- lokalne buildy Android i iOS: zaliczone.

## Otwarte testy

- biblioteka i aparat na iOS w ręcznym teście urządzeniowym;
- aparat na sprzęcie fizycznym;
- odmowa i ponowne nadanie uprawnień;
- dokładnie 5 MiB i plik ponad limit w teście urządzeniowym;
- ręczne anulowanie odpowiednio długiego uploadu;
- pomiar czasu SHA-256 dla pliku 5 MiB.

Krok 3.5 jest zaimplementowany. Bramka B-04 pozostaje otwarta do pełnego testu iOS
i aparatu na urządzeniu fizycznym.
