# ZglosTO  

Serwis umożliwiający zgłaszanie incydentów w mieście  

## Porty  

```
:9955 - authorization
:3000 - backend  
:1235 - frontend  
```

## Zmienne środowiskowe  

```
POSTGRES_USER = ...  
POSTGRES_PASSWORD = ...  
POSTGRES_DB = ...  
POSTGRES_PORT = ...  
DB_HOST = ...  
DATABASE_URL=  = ...  
NODE_ENV= = ...  
```

## Proces uruchomienia

1. Wchodzimy w katalog ZglosTO .  
2. Uruchamiamy komendę "docker compose build" .  
3. Uruchamiamy komendę "docker compose up" lub "docker compose up -d", jeśli chcemy uruchomić w tle.    