---
title: salve-db-server (backend de referência)
---

[`packages/salve-db-server`](https://github.com/Salve-Software/react-native-salve-db/tree/main/packages/salve-db-server) é um backend REST de referência pequeno, convencional, apoiado em Postgres, que implementa exatamente o contrato de sincronização que o sync engine nativo (`cpp/sync/`) espera — leia-o como a especificação executável de "que formato minha própria API precisa ter."

É contra ele que o app [`example/`](https://github.com/Salve-Software/react-native-salve-db/tree/main/example) e a suíte de testes `react-native-harness` no dispositivo de fato sincronizam. Ele não é publicado no npm (`private: true`) e não é feito para rodar em produção — ele existe para que o contrato tenha uma implementação real e funcional que você possa ler do início ao fim, rodar localmente e comparar com o seu próprio backend.

## Construindo seu próprio backend

Se você está implementando um servidor para o seu próprio app, não faça engenharia reversa a partir do código-fonte deste pacote — comece pelo [guia de Sincronização](./guides/sync.md), que documenta o algoritmo de push/pull, o comportamento de retry e o tratamento de conflitos do ponto de vista do cliente. Depois use o [código-fonte no GitHub](https://github.com/Salve-Software/react-native-salve-db/tree/main/packages/salve-db-server) de `packages/salve-db-server` como um exemplo concreto e funcional de um backend que o satisfaz.
