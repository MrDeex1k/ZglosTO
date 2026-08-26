# `@zglosto/transient-store`

Wspólna, provider-neutralna granica dla odtwarzalnego stanu krótkotrwałego ZgłosTO.
Pakiet nie przechowuje sesji ani danych biznesowych.

Udostępnia:

- podstawowe operacje cache z TTL;
- atomowy licznik z TTL do rozproszonego rate limitingu;
- krótką dzierżawę `SET NX PX` i bezpieczne zwolnienie przez porównanie tokenu;
- adapter Redis oparty na oficjalnym kliencie `redis`;
- fabrykę trybów `disabled`, `local` i `external`;
- ograniczone timeouty oraz zweryfikowane TLS dla `rediss://`.

Fabryka czyta adres Redis z pliku sekretu. Wartości, adresy z poświadczeniami oraz surowe
identyfikatory użytkowników nie mogą trafiać do komunikatów błędów ani nazw kluczy.
Podłączenie adaptera do Better Auth, limiterów domenowych i cache publicznej listy jest
realizowane w kolejnych krokach Fazy 10.
