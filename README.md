# 🤖 FinanZas WhatsApp Bot

Um bot de WhatsApp para o sistema de gestão financeira FinanZas, permitindo que os usuários registrem transações (entradas e saídas) e consultem um resumo financeiro diretamente pelo chat do WhatsApp.

O bot é construído em Node.js usando a biblioteca `whatsapp-web.js` para integração com o WhatsApp e `axios` para comunicação com uma API de backend em Spring Boot.

## ✨ Funcionalidades

O bot permite que o usuário realize as seguintes ações após a autenticação:

  * **Conexão de Usuário:** Autenticação inicial via UID (ID de Usuário) do FinanZas para vincular o número do WhatsApp à conta do sistema.
  * **Registro de Entrada (Receita):** Registra uma nova entrada (Ex: `entrada 2000 salário`).
  * **Registro de Saída (Despesa):** Registra uma nova saída (Ex: `saida 45 almoço`).
  * **Resumo Financeiro:** Exibe o total de entradas, total de saídas e o saldo atual.
  * **Menu/Ajuda:** Exibe o menu principal e a lista de comandos.
  * **Desconexão:** Remove a vinculação entre o número do WhatsApp e o UID do FinanZas.

## ⚙️ Pré-requisitos

Para rodar este bot, você precisará ter instalado:

  * [Node.js](https://nodejs.org/) (A versão do `whatsapp-web.js` instalada requer `>=18.0.0`).
  * Um servidor de backend FinanZas (Spring Boot) rodando e acessível na porta configurada.
  * Uma conta WhatsApp ativa para ser usada como cliente do bot.

## 🚀 Instalação

1.  **Clone o repositório:**

    ```bash
    git clone https://github.com/fpsmount/finanZas-bot-whatsapp.git
    cd finanZas-bot-whatsapp
    ```

2.  **Instale as dependências:**
    O projeto utiliza `axios`, `dotenv`, `express` e `whatsapp-web.js`.

    ```bash
    npm install
    ```

## 🛠️ Configuração

### Backend API URL

O bot se comunica com o backend do FinanZas através da URL base.

No arquivo `index.js`, a URL da API está definida como:

```javascript
const API_BASE_URL = 'http://localhost:8080/api';
```

**Observação:** Certifique-se de que seu servidor Spring Boot esteja rodando e acessível neste endereço, ou altere a URL no arquivo `index.js` conforme necessário.

### Autenticação do WhatsApp

O bot usa o `LocalAuth` do `whatsapp-web.js` para gerenciar a sessão.

1.  Ao iniciar, um código QR será gerado no console.
2.  Escaneie o código QR com o seu celular no WhatsApp em **Aparelhos Conectados**.
3.  Os dados da sessão serão salvos na pasta `.wwebjs_auth`.

## ▶️ Como Executar

O projeto utiliza `nodemon` para desenvolvimento, que reinicia automaticamente o bot a cada alteração no arquivo.

Para iniciar o bot em modo de desenvolvimento, use o script `start`:

```bash
npm start
```

## 💬 Como Usar o Bot no WhatsApp

### 1\. Conexão Inicial (Autenticação)

Ao interagir pela primeira vez, o bot solicitará seu ID de Usuário (UID) do FinanZas.

1.  Envie: `oi` ou `olá`.
2.  Siga as instruções para obter seu UID no site do FinanZas.
3.  Cole o UID no chat usando o comando no seguinte formato:
    ```
    CONECTAR SEU_ID_AQUI
    ```
    (Ex: `CONECTAR A1B2C3D4E5...`)

### 2\. Comandos Principais

Após a conexão, envie **MENU** para acessar as opções:

| Opção | Comando | Descrição | Exemplo de Uso (Após selecionar a opção) |
| :---: | :---: | :--- | :--- |
| **1** | Entrada | Registrar uma receita. | `2000 salário` |
| **2** | Saída | Registrar uma despesa. | `45 almoço` |
| **3** | Resumo | Exibir o total de entradas, saídas e saldo. | *(Busca automática)* |
| **4** | Desconectar | Encerrar a sessão e remover a autenticação. | *(Ação imediata)* |

#### 📝 Detalhes do Registro de Transações

O bot processa a descrição para categorizar as transações:

  * **Entradas:** Se a descrição contiver "salário" ou "fixo", a propriedade `salario` será definida como `true` no payload.
  * **Saídas:** Se a descrição contiver "fixa", a propriedade `tipo` será definida como `'fixa'`, caso contrário, será `'variável'`.

## 📜 Scripts Disponíveis

| Script | Comando | Descrição |
| :--- | :--- | :--- |
| `start` | `nodemon index.js` | Inicia o bot em modo de desenvolvimento, com reinicialização automática. |
| `test` | `echo "Error: no test specified" && exit 1` | Placeholder para testes (nenhum teste configurado). |
