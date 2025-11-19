# Serwis LLM

Ten folder zawiera serwis LLM dla aplikacji ZglosTO oparty na FastAPI i modelu Google Gemma 3 1B.

## Struktura

```
llm_service/
├── main.py - główny plik aplikacji FastAPI
├── pyproject.toml - zależności projektu
├── Dockerfile - konfiguracja Docker
├── start.sh - skrypt uruchomieniowy
├── README_LLM.md - dokumentacja
└── __pycache__/ - cache Pythona
```

## Konfiguracja

### Zależności

Projekt używa `uv` do zarządzania zależnościami. Zainstaluj `uv`:

```bash
# Na macOS i Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Na Windows
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Następnie zainstaluj zależności:

```bash
cd llm_service
uv sync
```

### Uruchomienie

```bash
uv run main.py
```

Serwer uruchomi się na porcie **8123**.

Alternatywnie, użyj Docker:

```bash
docker build -t llm-service .
docker run -p 8123:8123 llm-service
```

## Dostępne endpointy

Wszystkie endpointy są dostępne pod adresem `http://localhost:8123`.

### 1. Health Check

**Endpoint:** `GET /health`

**Opis:** Sprawdza status ładowania modelu LLM.

**Przykład curl:**
```bash
curl http://localhost:8123/health
```

**Przykład fetch (JavaScript):**
```javascript
const response = await fetch('http://localhost:8123/health');
const data = await response.json();
console.log(data);
```

**Response (Success):**
```json
{
  "model": "google/gemma-3-1b-it",
  "loaded": true
}
```

**Response (Error - Model not loaded):**
```json
{
  "model": "google/gemma-3-1b-it",
  "loaded": false,
  "error": "opis błędu"
}
```

---

### 2. Klasyfikacja zgłoszenia

**Endpoint:** `POST /query_message`

**Opis:** Klasyfikuje zgłoszenie jako "SŁUŻBY MIEJSKIE" lub "SŁUŻBY RATUNKOWE" na podstawie treści.

**Request Body:**
```json
{
  "prompt": "Treść zgłoszenia"
}
```

**Wymagane pola:**
- `prompt` (string) - Treść zgłoszenia do klasyfikacji

**Przykład curl:**
```bash
curl -X POST http://localhost:8123/query_message \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Dziura w drodze na ulicy głównej"
  }'
```

**Przykład fetch (JavaScript):**
```javascript
const response = await fetch('http://localhost:8123/query_message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'Dziura w drodze na ulicy głównej'
  })
});

const data = await response.json();
console.log(data);
```

**Response (Success):**
```json
{
  "response": "SŁUŻBY MIEJSKIE"
}
```

**Response (Error):**
```json
{
  "detail": "opis błędu"
}
```

## Rozwiązywanie problemów

### Błąd ładowania modelu
Upewnij się, że masz dostęp do internetu podczas pierwszego uruchomienia (model zostanie pobrany). Sprawdź logi aplikacji.

### Port zajęty
Jeśli port 8123 jest zajęty, zmień port w `main.py` lub użyj innego portu w Dockerze.

### Problemy z zależnościami
Upewnij się, że `uv` jest zainstalowany i uruchom `uv sync` w folderze `llm_service`.