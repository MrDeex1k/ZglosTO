# @zglosto/white-label-config

Node-only loader wersjonowanej konfiguracji White-Label. Pakiet czyta jeden plik YAML
wskazany przez `WHITE_LABEL_CONFIG`, parsuje go jako niezaufane dane i waliduje przez strict
schema z `@zglosto/contracts`.

```ts
import { loadProcessWhiteLabelConfig } from '@zglosto/white-label-config';

const { config, checksum, path } = loadProcessWhiteLabelConfig();
```

`createWhiteLabelConfigReadiness(loaded)` tworzy wspolny, bezpieczny stan readiness z
`status: "valid"`, `configVersion` i checksumem, bez sciezki pliku ani zawartosci configu.

## Gwarancje

- ścieżka może być bezwzględna albo względna wobec katalogu roboczego procesu;
- brak pliku, błędny YAML i niezgodność ze schematem kończą się typowanym błędem;
- komunikat błędu nie zawiera treści źródłowego YAML;
- checksum to SHA-256 dokładnej zawartości pliku;
- kontrakt odrzuca sekrety, poświadczenia w URL-ach i interpolację ENV bez umieszczania
  wykrytej wartości w błędzie;
- loader procesu cache'uje pierwszą poprawną konfigurację;
- ponowne wskazanie innego pliku w tym samym procesie jest blokowane;
- nie ma hot reloadu ani wyboru miasta w runtime.

Do walidacji narzędziowej wielu plików, bez aktywowania konfiguracji procesu, służy
`loadWhiteLabelConfigFile`.

Metadane potrzebne do wersjonowanego buildu i rollout'u zwraca typowane CLI:

```bash
pnpm config:metadata config/white-label/zglosto.yaml json
```

Wynik zawiera `cityKey`, `configVersion`, checksum SHA-256 i znormalizowana sciezke. Skrypty
wydania korzystaja z formatu `fields`, bez parsowania YAML-a w Bashu.
