# Selected anti-slop rules

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop/tree/c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b), commit `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`.

The four rules and their array helper are vendored unchanged under the included MIT license. The entry point selects only these rules. No spacing, boundary-validation, naming, mocking, or Effect rules are enabled.

Chained assertions are errors in production code; widening followed by assertions and quadratic accumulator copies are errors repository-wide. Safety comments are required in mobile production code: remove redundant assertions or explain the checked invariant with `SAFETY:`. Test files are exempt from the two assertion rules because adapter fixtures intentionally implement only the exercised part of large Redis/Nest interfaces, and contract tests represent invalid boundary input. Production validation remains strict.
