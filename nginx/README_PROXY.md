# Serwer proxy NGINX

Ten folder zawiera konfigurację serwera proxy NGINX dla aplikacji ZglosTO, który zarządza routingiem ruchu między frontendem, backendem, autoryzacją i PgAdmin.

## Struktura

```
nginx/
├── nginx.conf - główna konfiguracja NGINX
├── Dockerfile - kontener Docker
└── README_PROXY.md - dokumentacja
```

## Konfiguracja

Konfiguracja NGINX jest zdefiniowana w pliku `nginx.conf` i składa się z dwóch serwerów:

### Serwer główny (Port 1235)
Główny punkt wejścia aplikacji obsługujący:
- Frontend React
- Backend API
- Serwis autoryzacji

### Serwer PgAdmin (Port 9753)
Dedykowany serwer dla narzędzia administracyjnego bazy danych PgAdmin.

## Budowanie i uruchamianie

### Docker

```bash
cd nginx
docker build -t zglosto-nginx .
docker run -p 1235:1235 -p 9753:9753 zglosto-nginx
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
Proxy: http://frontend:80
```
Wszystkie żądania do głównego adresu są proxy'owane do kontenera frontend.

**Przykład:**
```bash
curl http://localhost:1235/
# → przekierowanie do frontend:80
```

#### 2. Backend API (/api/)
```
Location: /api/
Proxy: http://backend:3000
```
Żądania zaczynające się od `/api/` są proxy'owane do backendu.

**Przykład:**
```bash
curl http://localhost:1235/api/incidents
# → przekierowanie do backend:3000/api/incidents
```

#### 3. Autoryzacja (/api-auth/)
```
Location: /api-auth/
Proxy: http://authorization:9955
```
Żądania autoryzacji są proxy'owane do serwera autoryzacji.

**Przykład:**
```bash
curl http://localhost:1235/api-auth/sign-in/email
# → przekierowanie do authorization:9955/api-auth/sign-in/email
```

### Serwer PgAdmin (Port 9753)

#### 1. Interfejs PgAdmin (/)
```
Location: /
Proxy: http://pgadmin:80
```
Wszystkie żądania do portu 9753 są proxy'owane do PgAdmin.

**Przykład:**
```bash
curl http://localhost:9753/
# → przekierowanie do pgadmin:80
```

## Nagłówki proxy

Wszystkie lokalizacje przekazują następujące nagłówki do usług docelowych:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

Serwer PgAdmin dodatkowo przekazuje:
```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

## Architektura

```
Internet → NGINX (Porty: 1235, 9753)
    ├── Port 1235 → Frontend (:80)
    ├── Port 1235 → Backend (:3000) - prefiks /api/
    ├── Port 1235 → Authorization (:9955) - prefiks /api-auth/
    └── Port 9753 → PgAdmin (:80)
```

## Rozwiązywanie problemów

### Porty zajęte
Jeśli porty 1235 lub 9753 są zajęte, zmień konfigurację portów w `docker-compose.yml` lub uruchom NGINX na innych portach.

### Problemy z routingiem
Sprawdź czy wszystkie serwisy (frontend, backend, authorization, pgadmin) są uruchomione i nasłuchują na oczekiwanych portach.

### Błędy połączenia
Upewnij się, że nazwy usług w Docker Compose odpowiadają nazwom w konfiguracji NGINX (frontend, backend, authorization, pgadmin).

### Logi NGINX
Aby zobaczyć logi NGINX w kontenerze:

```bash
docker logs <container-name>
```

## Bezpieczeństwo

Konfiguracja zawiera podstawowe nagłówki proxy, ale dla środowiska produkcyjnego rozważ dodanie:

- SSL/TLS (Let's Encrypt lub własne certyfikaty)
- Rate limiting
- Dodatkowe nagłówki bezpieczeństwa
- Autoryzację dostępu do PgAdmin
