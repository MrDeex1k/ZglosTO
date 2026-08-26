# Serwer proxy NGINX

Ten folder zawiera konfigurację serwera proxy NGINX dla aplikacji ZglosTO, który zarządza routingiem ruchu między frontendem, backendem, autoryzacją i serwisem LLM.

## Struktura

```
nginx/
├── nginx.conf - główna konfiguracja NGINX
├── production.conf - utwardzona konfiguracja HTTPS
├── Dockerfile - kontener Docker
└── README_PROXY.md - dokumentacja
```

## Konfiguracja

Konfiguracja NGINX jest zdefiniowana w pliku `nginx.conf` i składa się z jednego publicznego serwera:

### Serwer główny (Port 1235)

Główny punkt wejścia aplikacji obsługujący:

- Frontend React
- Backend API
- Serwis autoryzacji
- Serwis LLM

## Budowanie i uruchamianie

### Docker

```bash
cd nginx
docker build -t zglosto-nginx .
docker run -p 1235:1235 zglosto-nginx
```

### Docker Compose

Serwer proxy jest częścią konfiguracji Docker Compose głównego projektu:

```bash
docker-compose up nginx
```

## Konfiguracja routingu

### Główny serwer (Port 1235)

#### 1. Frontend (/)

```
Location: /
Proxy: http://frontend:8080
```

Wszystkie żądania do głównego adresu są proxy'owane do kontenera frontend.

**Przykład:**

```bash
curl http://localhost:1235/
# → przekierowanie do frontend:8080
```

#### 2. Backend API (/api/)

```
Location: /api/
Proxy: http://backend:3000
```

Żądania zaczynające się od `/api/` są proxy'owane do backendu po usunięciu publicznego prefiksu `/api`.

**Przykład:**

```bash
curl http://localhost:1235/api/mieszkaniec/incydenty/glowna
# → backend:3000/mieszkaniec/incydenty/glowna
```

Publiczna lista ma osobną lokalizację exact-match i ograniczony cache dyskowy/tmpfs.
Backend przekazuje wewnętrzny `X-Accel-Expires`: `900 s` przy `REDIS_MODE=disabled` lub
`30 s` przy `local`/`external`. Nginx ukrywa ten nagłówek, dodaje `X-Cache-Status`, używa
`proxy_cache_lock` i nie przekazuje do publicznego upstream `Cookie` ani `Authorization`.
Cache obejmuje tylko odpowiedzi `200` dla `GET`/`HEAD`; błędy, mutacje i `Set-Cookie` nie
są zapisywane.

#### 3. Autoryzacja (/api/auth/)

```
Location: /api/auth/
Proxy: https://authorization:9956/api/auth/ (mTLS jako nginx-client)
```

Żądania autoryzacji są proxy'owane do serwera autoryzacji.

**Przykład:**

```bash
curl http://localhost:1235/api/auth/get-session
# → authorization:9956/api/auth/get-session przez TLS 1.3/mTLS
```

#### 4. LLM (/llm/)

```
Location: /llm/
Proxy health: https://llm_gateway:8130/health z mTLS (klasyfikacja pozostaje wewnętrzna)
```

Prefiks `/llm` jest usuwany przed przekazaniem requestu.

## Nagłówki proxy

Wszystkie lokalizacje przekazują następujące nagłówki do usług docelowych:

```nginx
proxy_set_header Host $http_host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Host $http_host;
proxy_set_header X-Forwarded-Proto $scheme;
```

## Architektura

```
Internet → NGINX (Port: 1235)
    ├── Port 1235 → Frontend (:80)
    ├── Port 1235 → Backend (:3000) - prefiks /api/
    ├── Port 1235 → Authorization (:9956/mTLS) - prefiks /api/auth/
    └── Port 1235 → LLM (:8123) - prefiks /llm/
```

## Rozwiązywanie problemów

### Porty zajęte

Jeśli port 1235 jest zajęty, zmień konfigurację portu w `docker-compose.yml` lub uruchom NGINX na innym porcie.

### Problemy z routingiem

Sprawdź czy wszystkie serwisy (frontend, backend, authorization, llm_gateway) są uruchomione i nasłuchują na oczekiwanych portach.

### Błędy połączenia

Upewnij się, że nazwy usług w Docker Compose odpowiadają nazwom w konfiguracji NGINX (frontend, backend, authorization, llm_gateway).

### Logi NGINX

Aby zobaczyć logi NGINX w kontenerze:

```bash
docker logs <container-name>
```

## Bezpieczeństwo

Nginx przedstawia Authorization certyfikat `nginx-client`, ufa wyłącznie Service CA,
weryfikuje DNS `authorization` i dopuszcza TLS 1.3. Certyfikat klienta nie jest przekazywany
przeglądarce ani Expo. Healthcheck kontenera odpytuje `/api/auth/get-session`, dlatego
potwierdza również działanie zabezpieczonego upstreamu, a nie tylko procesu Nginx.

Konfiguracja zawiera podstawowe nagłówki proxy, ale dla środowiska produkcyjnego rozważ dodanie:

- SSL/TLS (Let's Encrypt lub własne certyfikaty)
- Rate limiting
- Dodatkowe nagłówki bezpieczeństwa
