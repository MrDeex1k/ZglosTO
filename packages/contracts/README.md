# @zglosto/contracts

Wspólne źródło typów, stabilnych wartości runtime i parserów danych przekraczających granice
usług ZglosTO.

## Moduły

- `common` — błędy walidacji i bezpieczne zawężanie `unknown`;
- `auth` — role, dodatkowe pola użytkownika oraz kontrakt sesji web/mobile;
- `incidents` — statusy, bieżące DTO HTTP, docelowy model zgłoszenia i parsery odpowiedzi;
- `services` — statystyki i operacje służb;
- `admin` — zmiana ról i przypisań użytkowników;
- `images` — neutralne referencje i metadane Object Storage;
- `media` — wersjonowane zadania i wyniki przetwarzania zdjęć, topologia retry/DLQ;
- `llm` — klasyfikacje, fallback, health oraz parsery odpowiedzi;
- `white-label` — strict schemat Zod konfiguracji produktu, typy inferowane, walidacje
  między polami oraz parsery pełnego i publicznego kontraktu White-Label.

Publiczne importy przechodzą przez `src/index.ts`:

```ts
import {
  parseCurrentIncidentList,
  parseWhiteLabelConfig,
  type CurrentIncidentListItemDto,
  type WhiteLabelConfig,
  type UserRole,
} from '@zglosto/contracts';
```

## Zasady

- Pakiet nie zależy od frameworków HTTP, UI, bazy ani storage.
- Nie używa `any` ani `undefined`.
- Każde pole kontraktu jest wymagane; brak wartości oznacza `null` albo osobny wariant unii.
- Dane z HTTP zaczynają jako `unknown` i są przetwarzane przez parser przed użyciem.
- `Current*` opisuje obecny polskojęzyczny kontrakt HTTP. Typy bez tego prefiksu opisują
  stabilny model docelowy.
- Zamknięte katalogi, takie jak role i statusy, mają jedną wartość runtime, z której wynika
  odpowiadający typ TypeScript.
- `whiteLabelConfigSchema` jest jedynym źródłem typu `WhiteLabelConfig`. Schemat odrzuca
  nieznane pola, a `parseWhiteLabelConfig` przyjmuje wyłącznie niezaufane `unknown`.
- White-Label config jest zawsze publiczny: schemat odrzuca pola przeznaczone na sekrety,
  rozpoznawalny materiał kluczy/tokenów, URL-e z poświadczeniami i interpolację ENV. Błędy
  wskazują ścieżkę naruszenia bez powtarzania znalezionej wartości.
- Pełny kontrakt i `publicWhiteLabelConfigSchema` mają osobne ścisłe granice, aby przyszłe
  pola wewnętrzne nie zostały automatycznie udostępnione w API.
- `WHITE_LABEL_DEPLOYMENT_MODEL` ma wartość `single-city`: jeden proces/deployment przyjmuje
  jeden obiekt konfiguracji z jednym polem `city`. Kolekcje miast i pola tenantowe są poza
  kontraktem.
- `SUPPORTED_LOCALES`, `DEFAULT_LOCALE` i `DEPLOYMENT_TIMEZONE` są wspólnymi stałymi runtime.
  `localizedTextSchema` wymaga tekstu zarówno dla `pl-PL`, jak i `en`; niepełne tłumaczenie
  konfiguracji nie przechodzi walidacji.
- Nazwa miasta, opis logo, publiczny kontakt i `localContent` są częścią publicznego strict
  kontraktu. Branding przyjmuje wyłącznie ścieżki/URL-e zasobów oraz kontrolowane kolory
  `#RRGGBB`, nigdy dowolny CSS.
- Każda usługa miejska ma stabilny `key`, lokalizowane `label`, `shortLabel`, opcjonalny
  opis i kontrolowaną prezentację. Historyczne etykiety bazy nie są częścią kontraktu.

## Polecenia

```bash
pnpm --filter @zglosto/contracts typecheck
pnpm --filter @zglosto/contracts build
```
