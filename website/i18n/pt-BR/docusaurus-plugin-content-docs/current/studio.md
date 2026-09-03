---
title: Salve DB Studio
---

Salve DB Studio é uma UI local, com conexão ao vivo, para navegar e editar o banco de dados do seu app em execução direto do navegador — no estilo Prisma Studio ou Drizzle Studio, mas apontada para o SQLite real dentro do seu simulador ou dispositivo, não para uma cópia dele.

Não existe etapa de exportação/importação nem "atualizar para ver as mudanças" — o Studio mantém uma conexão WebSocket ao vivo com o seu app, então os dados das tabelas, edições de linhas e resultados de queries refletem exatamente o que está no dispositivo agora.

![Salve DB Studio](/img/db-studio.png)

## Executando

A partir da raiz do repositório deste monorepo:

```bash
npm run db:studio
```

Isso inicia o servidor do Studio ([`packages/salve-db-studio`](https://github.com/Salve-Software/react-native-salve-db/tree/main/packages/salve-db-studio)) — um relay Express + WebSocket escutando na **porta 7377** — e serve a UI React do Studio, abrindo-a automaticamente no seu navegador padrão.

### Usando fora deste monorepo

Se você está consumindo `react-native-salve-db` como dependência no seu próprio app (sem estar trabalhando dentro deste repositório), execute o Studio com:

```bash
npx salve-db-studio
```

Não é necessária nenhuma etapa de instalação. Isso funciona por causa de um pequeno truque de empacotamento: `salve-db-studio` (o nome simples, sem escopo, que você consegue rodar diretamente com `npx`) é um pacote lançador minúsculo cujo único trabalho é `require('@salve-software/salve-db-studio')`. Sua dependência do pacote real está fixada em `"*"`, então o npm/npx sempre resolve para o que estiver marcado como `latest` no registry no momento — o lançador em si nunca precisa ser republicado quando o pacote real do Studio lança uma nova versão. Você sempre obtém o Studio mais recente, toda vez que roda o comando.

## Conectando seu app

Não há nenhuma configuração para adicionar. Quando seu app chama `Database.configure(...)` enquanto está rodando em `__DEV__`, ele abre automaticamente uma conexão WebSocket com `ws://localhost:7377` e começa a transmitir eventos `change` ao vivo para o Studio enquanto você usa o app — cada insert, update e delete disparado a partir do seu JS ou da sincronização aparece lá quase em tempo real.

Isso significa que o fluxo de trabalho usual é:

1. Inicie seu app normalmente (`npx react-native run-ios` / `run-android`, ou os próprios scripts do app `example/`).
2. Execute `npm run db:studio` (ou `npx salve-db-studio` fora deste repositório).
3. A aba do navegador do Studio se conecta automaticamente — sem etapa de pareamento, sem inserir host/porta manualmente.

### Múltiplos dispositivos e simuladores

Se você tiver mais de um simulador ou dispositivo rodando o app ao mesmo tempo — digamos, um simulador iOS e um emulador Android lado a lado, ou dois simuladores iOS para contas de teste diferentes — cada um abre sua própria conexão WebSocket e aparece como uma entrada separada no seletor de dispositivos do Studio. Escolha qual quiser inspecionar nessa lista; o Studio sempre mostra apenas os dados do dispositivo atualmente selecionado, então você nunca está olhando para uma visão mesclada ou ambígua.

## O que você pode fazer pela UI

Uma vez conectado a um dispositivo, o Studio te dá acesso completo de leitura/escrita ao banco de dados SQLite ao vivo desse dispositivo:

- **Navegar por todas as tabelas** — incluindo as tabelas internas de sincronização `_salve_*` (`_salve_sync_queue`, `_salve_sync_cursors`, `_salve_sync_metadata`, e afins) que o [Trigger Engine e a Sync Queue](./guides/sync.md) mantêm automaticamente. Essa é a forma mais rápida de responder "por que essa linha ainda não sincronizou" — você consegue ver a operação enfileirada de fato, seu estado de retry e a posição do cursor lado a lado com suas próprias tabelas.
- **Inserir, editar e excluir linhas** diretamente, com os mesmos triggers disparando como se a mudança tivesse vindo do próprio app — uma edição feita no Studio enfileira uma operação de sincronização exatamente como uma chamada `Database.update(...)` do lado JS faria.
- **Executar SQL bruto** contra o banco de dados ao vivo — útil para queries de inspeção pontuais, joins entre tabelas que a visão de tabela do Studio não modela, ou reproduzir um bug com uma cláusula `WHERE` específica.
- **Truncar uma tabela**, limpando todas as suas linhas mas mantendo o schema.
- **Apagar uma tabela** — restrito às suas próprias tabelas de aplicação. As tabelas internas `_salve_*` que sustentam migrações e sincronização são visíveis e editáveis, mas não podem ser apagadas pela UI, já que removê-las de baixo de um sync engine em execução deixaria ele em um estado inconsistente.

## Quando usar

O Studio é uma ferramenta de tempo de desenvolvimento, não algo que você distribui — ele só ativa porque seu app chama `Database.configure(...)` sob `__DEV__`, então não há código para remover em builds de produção. Recorra a ele sempre que você estiver tentado a adicionar chamadas `console.log` temporárias em volta de uma query, inspecionar a fila de sincronização manualmente, ou mexer no conteúdo de tabelas através de um navegador SQLite separado apontado para um arquivo `.db` copiado. Por ser ao vivo e ser o banco de dados real no dispositivo, nada que você vê no Studio pode estar desatualizado ou fora de sincronia com o que o seu app está fazendo.

Para a estrutura das tabelas que você vai ver sob `_salve_*` e para que cada uma serve, veja o [guia de Sincronização](./guides/sync.md). Para a API de query que produz as mesmas mudanças de linha que o Studio transmite, veja o [guia do Query Builder](./guides/query-builder.md).
