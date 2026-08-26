# Faza 4.0 — baseline MVP mieszkańca

Data zamrożenia zakresu: 2026-08-21.

## Decyzje produktowe

- rejestracja tworzy konto z rolą `mieszkaniec` i od razu ustanawia sesję;
- brak weryfikacji e-maila nie blokuje logowania ani panelu mieszkańca;
- potwierdzenie e-maila przypisuje do konta wcześniejsze anonimowe zgłoszenia;
- formularz wymaga imienia i nazwiska, poprawnego e-maila, hasła min. 8 znaków
  oraz akceptacji regulaminu i polityki prywatności;
- anonimowe zgłoszenia pozostają dostępne;
- trwały, wersjonowany zapis zgód jest bramką przed betą i nie jest pozorowany
  przez lokalny stan formularza.

## Środowisko developerskie

- lokalne kontenery uruchamiane są z profilem Redis oraz nakładką
  `docker-compose.phase4.local.yml`;
- nakładka ustawia usługę autoryzacji w kontrolowany tryb testowy i zapisuje link
  weryfikacyjny w pamięci procesu zamiast wysyłać prawdziwy e-mail;
- endpoint outboxa i endpointy rejestracji/weryfikacji są dostępne wyłącznie przez
  loopbackową allowlistę proxy Mobile;
- Cloudflare Quick Tunnel nie jest potrzebny w tym kroku i nie przenosi danych
  uwierzytelniających;
- testy urządzeń obejmują wyłącznie iPhone Simulator oraz Android Emulator.

## Kontrakt scenariusza 4.1

1. Użytkownik otwiera rejestrację z ekranu logowania.
2. Walidacja lokalna blokuje niepełne dane i wskazuje konkretne pola.
3. Poprawny formularz wywołuje `POST /api/auth/sign-up/email`.
4. Backend tworzy mieszkańca, sesję i wiadomość w lokalnym outboxie.
5. Aplikacja otwiera panel, pokazuje stan niezweryfikowany i umożliwia ponowne
   wysłanie linku przez `POST /api/auth/send-verification-email`.
6. Link wywołuje serwerowe `GET /api/auth/verify-email`, a callback
   `zglosto://auth/email-verified` odświeża sesję na podstawie serwera.
7. Po powodzeniu znika przypomnienie o weryfikacji.

## Kryteria wyjścia

- walidacja i mapowanie błędów mają testy automatyczne;
- allowlista nie udostępnia pozostałych endpointów;
- rejestracja, resend i callback przechodzą na obu emulatorach;
- logi aplikacji nie zawierają hasła, cookie ani tokenu weryfikacyjnego;
- pełny `pnpm check`, Expo Doctor i React Doctor nie wykazują nowych blokad.
