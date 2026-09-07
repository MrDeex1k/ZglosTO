# Przyjęcie zgłoszenia i rola LLM

Obowiązujący przepływ po zmianach z 7 września 2026:

1. Backend waliduje zgłoszenie i wybraną służbę. Jeśli służby nie wskazano, używa
   `routing.fallbackServiceKey` miasta.
2. LLM udziela wskazówki, czy poza zgłoszeniem potrzebny jest telefon na 112. Nie zmienia
   adresata zgłoszenia. Oczekiwanie jest ograniczone przez `LLM_TIMEOUT_MS`, łącznie z
   pobieraniem treści odpowiedzi. Nie ma automatycznego ponawiania tego wywołania.
3. Backend zapisuje zgłoszenie oraz wynik klasyfikacji. Potwierdzenie sukcesu jest zwracane
   dopiero po zakończeniu operacji zapisu i obsługi załącznika.
4. Frontend i Mobile korzystają ze wspólnej funkcji `incidentSubmissionNotice` w pakiecie i18n.
   Nazwa służby pochodzi z konfiguracji miasta i klucza zapisanego zgłoszenia.

| Wynik                                             | Komunikat dla użytkownika                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `municipal`                                       | Potwierdzenie przyjęcia i nazwa służby.                                                                                    |
| `emergency`                                       | Potwierdzenie i nazwa służby, zalecenie telefonu na 112 oraz informacja, że zapis w aplikacji nie oznacza wezwania pomocy. |
| `unknown`, w tym timeout, wyłączenie i awaria LLM | Takie samo potwierdzenie jak dla zwykłego przyjęcia. Bez technicznego komunikatu o modelu lub ręcznej klasyfikacji.        |
| Nieudany zapis                                    | Błąd wysłania; brak potwierdzenia przyjęcia.                                                                               |

Wynik zwykłego przyjęcia nie jest zapewnieniem, że sytuacja jest bezpieczna. Dotychczasowa
informacja alarmowa przed wysłaniem formularza pozostaje widoczna. System nie wykonuje
automatycznego telefonu ani nie wysyła dyspozycji do służb ratunkowych.

Techniczne pola `classification`, `source`, `reason` i `modelAvailable` pozostają w API i bazie
na potrzeby diagnostyki. Nie ma migracji historycznych zgłoszeń: zachowują dotychczasowe
przypisanie do służby. Zmiana routingu dotyczy nowych zgłoszeń.

Testy jednostkowe obejmują klasyfikację, przekroczenie czasu, zapis dla trzech wyników LLM,
jednakowe komunikaty web/mobile oraz izolację służb w zaktualizowanym scenariuszu integracyjnym.
Pełny scenariusz Compose wymaga oddzielnego uruchomienia z bazą, Auth i Object Storage.
