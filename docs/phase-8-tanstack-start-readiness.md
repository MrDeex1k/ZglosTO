# Faza 8: bramka gotowości TanStack Start

> **Dokument historyczny:** zapis decyzji sprzed ukończenia WEB i Mobile. Aktualny stan
> Mobile opisuje [Mobile/CURRENT_STATE.md](../Mobile/CURRENT_STATE.md).

**Status: zaliczona 2026-07-24.**

## Zweryfikowany wariant

Frontend przechodzi z Vite React SPA do TanStack Start `1.168.32` w trybie SPA:

```ts
tanstackStart({
  spa: {
    enabled: true,
  },
});
```

To jest świadomy etap pośredni, a nie rezygnacja z możliwości TanStack Start.
Pozwala najpierw wymienić framework i zachować obecny model wdrożenia, a dopiero w
następnych krokach wydzielić routy, loadery, guardy i warstwę danych.

## Wynik kontroli

- **Node:** wymaganie TanStack Start to Node `>=22.12.0`; projekt używa Node `26.5.0`.
- **React:** pakiet wspiera React 18 i 19; projekt używa React `19.2.8`.
- **Vite:** pakiet wymaga Vite `>=7`; projekt używa Vite `8.1.5`.
- **TypeScript:** aplikacja pozostaje w pełni typowana i korzysta z TypeScript `7.0.2`.
- **Better Auth:** klient nadal komunikuje się przez ten sam publiczny adres
  `/api/auth`. Certyfikat mTLS pozostaje odpowiedzialnością proxy w środowisku
  developerskim i głównego nginx w Compose.
- **API domenowe:** NestJS pozostaje jedynym API domenowym. TanStack Start nie uzyskuje
  bezpośredniego dostępu do PostgreSQL ani RustFS.
- **Docker/nginx:** tryb SPA zachowuje statyczny artefakt hostowany przez nginx, obecne
  endpointy healthcheck i fallback do dokumentu aplikacji.
- **White-Label:** konfiguracja nadal jest walidowana podczas budowania, osadzana w
  bundle i zapisywana w artefakcie `health/ready.json`.
- **React Native:** przyszła aplikacja mobilna nadal korzysta bezpośrednio z
  authorization i NestJS; nie zależy od server functions TanStack Start.

## Granice kroku 5

Krok 5 obejmuje konfigurację TanStack Start, dokument HTML, router główny, trasę
indeksową oraz zgodny artefakt wdrożeniowy. Obecny komponent `App` jest podłączony do
trasy indeksowej bez równoczesnego przepisywania jego nawigacji.

Podział na `/login`, `/register` i routy dashboardów jest krokiem 6. Loadery, guardy,
TanStack Query, Table i Form zaplanowano jako kolejne, osobno weryfikowane kroki.
W późniejszym kroku 9 TanStack Table został świadomie porzucony jako nieuzasadniony
dla obecnych widoków kart; nie jest częścią aktualnie wdrażanego stosu.

## Kryteria odbioru

- [x] produkcyjny build TanStack Start generuje statyczny frontend;
- [x] obraz `frontend` uruchamia `dist/client` przez nginx z fallbackiem `_shell.html`;
- [x] `/health/ready` potwierdza poprawny White-Label config;
- [x] Better Auth i API zachowują dotychczasowe publiczne ścieżki;
- [x] TypeScript, OxLint, OxFmt, 159 testów Vitest i pełne `pnpm check` przechodzą;
- [x] React Doctor zwraca `0/0/0`;
- [x] pełny Compose uruchamia aplikację z nowego entrypointu bez błędów ani ostrzeżeń
      konsoli przeglądarki.

## Wynik wdrożenia kroku 5

Kod używa TanStack Start `1.168.44` i TanStack Router `1.170.27`, przypiętych dokładnie
po kontroli Socket Firewall. Stary `index.html` i ręczny `createRoot` zostały usunięte.
TanStack Router generuje `src/routeTree.gen.ts`; plik jest wyłączony z reguł dotyczących
ręcznie utrzymywanego kodu, lintowania i formatowania.

Prerendering ujawnił i domknął dwie wcześniejsze ukryte granice:

- do bundle trafia teraz wynik `createPublicWhiteLabelConfig`, więc wyłączone usługi
  nie naruszają publicznego kontraktu;
- certyfikaty mTLS proxy Vite są wczytywane wyłącznie podczas `vite dev`, nie przez
  wewnętrzny serwer preview używany w Docker buildzie.
