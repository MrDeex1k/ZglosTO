# Checkpoint Fazy 4 — MVP mieszkańca

Data zamknięcia lokalnego: 2026-08-21.

## Decyzja

**CONTINUE — rozpocząć Fazę 5.** Wszystkie kroki 4.0–4.5 są zaimplementowane, a
wspólny scenariusz mieszkańca przeszedł na iPhone Simulator i Android Emulator.
Nie oznacza to gotowości do bety ani publikacji sklepowej.

## Dowody odbiorcze

- Maestro CLI 2.8.0 uruchamia aplikację od czystego stanu i przechodzi publiczny
  start, PL/EN, walidację, rejestrację, aktywną sesję, panel mieszkańca, konto,
  informacje prawne, kontakt i wylogowanie;
- wynik E2E: PASS na iPhone 17 Pro Simulator (iOS 26.5) oraz Pixel 9 Android
  Emulator;
- czyszczenie sesji niezależnie próbuje usunąć SecureStore, prywatne query,
  kontrolowany cache obrazów i robocze media; 28 plików / 96 testów przechodzi;
- wybrane media są kopiowane do kontrolowanego katalogu aplikacji i usuwane po
  zastąpieniu, anulowaniu, sukcesie, unmount oraz zakończeniu sesji;
- `PrivacyInfo.xcprivacy` jest generowany z konfiguracji Expo, a mapa danych znajduje
  się w `PRIVACY_DATA_INVENTORY.md`;
- TypeScript i testy Mobile przechodzą; Expo Doctor ma 20/21 z ośmioma wyłącznie
  patchowymi aktualizacjami SDK 57 do wykonania w osobnym checkpointcie zależności;
- React Doctor po poprawie cleanup nie zgłasza nowego ostrzeżenia z Fazy 4;
  pozostają wcześniejsze ostrzeżenia o manualnej memoizacji.

## Świadomie otwarte bramki

- zatwierdzone, publiczne źródła regulaminu i polityki prywatności;
- ręczny odsłuch VoiceOver i TalkBack;
- stały preview origin oraz produkcyjna domena/App Links;
- pełny cold restart/401 i prywatne obrazy/upload na iOS zgodnie z B-01–B-04;
- urządzenia fizyczne oraz iPad pozostają odroczone decyzją D-16.

Dokładna macierz znajduje się w `PHASE_4_ACCEPTANCE.tsv`.
