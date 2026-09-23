# Administrator: sprawy i uprawnienia w WEB

Panel administratora działa w przeglądarce. W Mobile 1.0 administrator dostaje
komunikat o konieczności użycia komputera, a nie mobilny panel administracyjny.
Do wejścia potrzebna jest sesja z rolą `admin`; zwykła rejestracja mieszkańca nie
nadaje tej roli.

## Przeglądaj i kieruj zgłoszenia

Po zalogowaniu wybierz „Panel Administratorski”. Menu ma trzy obszary:

- „Zobacz wszystkie zgłoszenia” — pełna lista z filtrami statusu i szczegółami;
- „Sprawdź nieprzypisane zgłoszenia” — sprawy skierowane do służby awaryjnej
  z konfiguracji miasta, wymagające decyzji o docelowej służbie;
- „Nadaj uprawnienia służb” — role i przypisania kont pracowników.

W szczegółach zgłoszenia możesz wybrać właściwą aktywną służbę, ustawić status i flagę
sprawdzenia. Po zapisie wróć do listy i upewnij się, że sprawa jest we właściwej kolejce.
Zmiana przypisania nie jest zmianą nazwy służby w konfiguracji miasta; katalog służb
ustala [konfiguracja White-Label](white-label-configuration.md).

## Nadaj dostęp pracownikowi

W obszarze uprawnień podaj e-mail istniejącego konta. Możesz zmienić rolę konta na
„Mieszkaniec” albo „Służby”, a w osobnym formularzu przypisać do konta pracownika
jedną aktywną służbę. Formularz przypisania ustawia jednocześnie rolę służby.
Po każdej operacji sprawdź komunikat o wyniku i przetestuj dostęp odpowiednim kontem.
Nie udostępniaj konta administratora kilku pracownikom jako zamiennika przypisania ról.

Uprawnienia są egzekwowane przez backend, a nie jedynie przez ukrycie przycisków w WEB.
Konto służby widzi tylko sprawy swojego `serviceKey`. Gdy aktywna służba zostanie
wyłączona w konfiguracji, sprawdź przypisania kont i kolejkę. Szczegóły techniczne
opisują [kontrakty ról i sesji](api-contracts-baseline.md).
