# Sekrety klastra

Ten katalog celowo nie zawiera przykładowego zasobu `Secret` ani wartości zakodowanych
przez `stringData`/Base64. Pełny, niezawierający wartości kontrakt nazw zasobów,
kluczy i odbiorców znajduje się w
[`deploy/cluster-secret-contract.json`](../../deploy/cluster-secret-contract.json).

Sekrety muszą zostać utworzone w namespace `zglosto` przed wdrożeniem przez
zatwierdzony mechanizm zewnętrzny:

- External Secrets Operator,
- Secrets Store CSI Driver,
- Sealed Secrets.

Manifests aplikacji montują je jako pliki tylko do odczytu. Brak zasobu lub klucza
blokuje uruchomienie zależnego workloadu; aplikacja nie przechodzi wtedy na wartość
domyślną.
