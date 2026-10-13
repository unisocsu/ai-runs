# Testing and validation

Choose the smallest useful checks first: syntax/lint, unit tests, integration tests, then broader tests. For each check, record the command and observed result. Avoid executing untrusted artifacts. A successful static check is not proof of runtime correctness; clearly state what was and was not tested.