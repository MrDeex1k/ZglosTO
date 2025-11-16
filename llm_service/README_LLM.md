# LLM Service

Serwis oparty na FastAPI, który wykorzystuje model `google/gemma-3-1b-it` do klasyfikacji zgłoszeń jako "SŁUŻBY MIEJSKIE" lub "SŁUŻBY RATUNKOWE".

## Uruchomienie

```bash
# On macOS and Linux.
curl -LsSf https://astral.sh/uv/install.sh | sh

# On Windows.
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

```bash
uv run main.py
```

Serwer uruchomi się na porcie 8123.

## Endpointy

### GET /health
Zwraca status ładowania modelu w formacie JSON.

Przykład odpowiedzi:
```json
{
  "model": "google/gemma-3-1b-it",
  "loaded": true
}
```

### POST /query_message
Przyjmuje zgłoszenie w formacie JSON i zwraca klasyfikację.

Przykład żądania:
```json
{
  "prompt": "Dziura w drodze na ulicy głównej"
}
```

Przykład odpowiedzi:
```json
{
  "response": "SŁUŻBY MIEJSKIE"
}
```