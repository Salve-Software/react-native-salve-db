---
title: Instalação
sidebar_label: Instalação
---

## Requisitos

| Componente | Requisito |
|---|---|
| React Native | 0.86+ |
| `react-native-nitro-modules` | 0.36+ |
| Node | 22.11+ |
| Xcode | 15+ (iOS) |
| Android | `minSdk` 23, NDK 27.1.12297006 |

## Instale o pacote

```bash
npm install @salve-software/react-native-salve-db react-native-nitro-modules
```

## iOS

Instale os pods:

```bash
cd ios && pod install && cd ..
```

A sincronização em background e o provedor de credenciais OAuth2 precisam de entitlements
explícitos. Adicione ao seu app target:

**`Info.plist`**

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>com.salvedb.background.sync</string>
</array>
<key>UIBackgroundModes</key>
<array>
  <string>processing</string>
</array>
```

**`*.entitlements`**

```xml
<key>keychain-access-groups</key>
<array>
  <string>$(AppIdentifierPrefix)$(CFBundleIdentifier)</string>
</array>
```

> Sem isso, o app compila e roda normalmente — o agendador em background simplesmente nunca dispara e
> o provedor de credenciais não consegue persistir tokens. Não há erro em tempo de execução que
> aponte para isso, então é fácil passar despercebido.

## Android

Nenhuma configuração adicional. A biblioteca declara `INTERNET` e `ACCESS_NETWORK_STATE` no seu
próprio manifest e registra o job `WorkManager` automaticamente — um Gradle sync é suficiente.

## Próximos passos

Continue para o [Guia Rápido](quick-start.md) para definir seu primeiro schema e rodar uma query.
