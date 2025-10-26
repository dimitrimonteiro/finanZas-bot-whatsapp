const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

const app = express();
const PORT = 3000;

const API_BASE_URL = 'http://localhost:8080/api';

const userMap = {};

const userSessionState = {};

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "finanzas-bot" }),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ],
    }
});


client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('QR RECEIVED. Scan this QR code with your WhatsApp linked devices.');
});

client.on('ready', () => {
    console.log('✅ WhatsApp Client está pronto! O bot está conectado e pronto para receber mensagens.');
    console.log(`Conectando ao Spring Boot em: ${API_BASE_URL}`);
});

client.on('auth_failure', msg => {
    console.error('❌ Falha na Autenticação:', msg);
});

client.on('disconnected', (reason) => {
    console.log('Cliente desconectado', reason);
    client.initialize();
});

/**
 * Envia o Menu Principal para o usuário.
 * @param {Message} message - O objeto 'message' do whatsapp-web.js
 */
async function sendMainMenu(message) {
    const whatsappId = message.from;
    userSessionState[whatsappId] = 'in_menu';
    await message.reply(
`*Menu Principal*
Digite o *número* da opção desejada:

1️⃣ - Registrar Entrada
2️⃣ - Registrar Saída
3️⃣ - Resumo Financeiro
4️⃣ - Desconectar`
    );
}

/**
 * Envia o Sub-Menu de Transação para o usuário.
 * @param {Message} message - O objeto 'message' do whatsapp-web.js
 * @param {'entrada'|'saida'} type - O tipo de transação ('entrada' ou 'saida').
 */
async function sendTransactionMenu(message, type) {
    const whatsappId = message.from;
    const isEntrada = type === 'entrada';
    const typeLabel = isEntrada ? 'Entrada (Receita)' : 'Saída (Despesa)';
    
    userSessionState[whatsappId] = isEntrada ? 'awaiting_entrada_action' : 'awaiting_saida_action';
    
    await message.reply(
`*Menu de ${typeLabel}*
Digite o *número* da opção desejada:

1️⃣ - Registrar nova ${isEntrada ? 'Entrada' : 'Saída'}
2️⃣ - Ver últimos registros de ${typeLabel}
3️⃣ - Voltar ao Menu Principal`
    );
}


/**
 * Processa o registro de uma transação
 * * @param {Message} message - O objeto 'message' ORIGINAL do whatsapp-web.js
 * @param {string} text - O texto do comando a ser processado
 */
async function processTransaction(message, text) {
    const whatsappId = message.from;
    const userId = userMap[whatsappId];

    const parts = text.toLowerCase().split(' ');
    const command = parts[0];
    const valueStr = parts[1];

    const rawDescription = parts.slice(2).join(' ');
    const description = rawDescription || (command === 'entrada' ? 'Entrada via WhatsApp' : 'Saída via WhatsApp');

    if (command !== 'entrada' && command !== 'saida') {
        await message.reply('Comando não reconhecido. Digite *MENU* para ver as opções.');
        return false;
    }

    const value = parseFloat(valueStr.replace(',', '.'));

    if (isNaN(value) || value <= 0) {
        await message.reply(`❌ Valor inválido. Use o formato: [valor] [descrição].\nEx: 100 salário`);
        return false;
    }

    const isEntrada = command === 'entrada';

    const payload = {
        descricao: description,
        valor: value,
        data: new Date().toISOString().split('T')[0],
        ...(isEntrada
            ? { salario: description.toLowerCase().includes('salário') || description.toLowerCase().includes('fixo') }
            : { tipo: description.toLowerCase().includes('fixa') ? 'fixa' : 'variável' }),
    };

    const endpoint = isEntrada ? '/entradas' : '/saidas';

    try {
        const url = `${API_BASE_URL}${endpoint}?userId=${userId}`;

        await axios.post(url, payload);

        const typeLabel = isEntrada ? 'Entrada' : 'Saída';
        const formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

        message.reply(`✅ ${typeLabel} de ${formattedValue} (${payload.descricao}) registrada com sucesso no FinanZas!`);
        return true;
    } catch (error) {
        console.error('Erro ao comunicar com o Spring Boot:', error.response ? error.response.data : error.message);

        let errorMessage = 'Erro desconhecido ao registrar a transação.';
        if (error.response && error.response.status === 404) {
            errorMessage = 'O endpoint da API não foi encontrado (404). Verifique se o backend está na URL correta e rodando na porta 8080.';
        } else if (error.message.includes('ECONNREFUSED')) {
            errorMessage = 'Conexão recusada. O Spring Boot não está rodando no endereço especificado.';
        } else if (error.response && error.response.status === 400) {
            errorMessage = 'Requisição inválida (400). Verifique se os dados da transação estão no formato correto.';
        }

        message.reply(`❌ Ocorreu um erro: ${errorMessage}`);
        return false;
    }
}

/**
 * Busca e envia o resumo financeiro para o usuário.
 * @param {Message} message - O objeto 'message' ORIGINAL do whatsapp-web.js
 */
async function getFinancialSummary(message) {
    const whatsappId = message.from;
    const userId = userMap[whatsappId];

    try {
        const urlEntradas = `${API_BASE_URL}/entradas/total?userId=${userId}`;
        const urlSaidas = `${API_BASE_URL}/saidas/total?userId=${userId}`;

        const [entradasResponse, saidasResponse] = await Promise.all([
            axios.get(urlEntradas),
            axios.get(urlSaidas)
        ]);
        
        const totalEntradas = entradasResponse.data.total;
        const totalSaidas = saidasResponse.data.total;
        const saldo = totalEntradas - totalSaidas;

        const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

        const summaryMessage = 
`*📊 Resumo Financeiro*

*Entradas (Total)*: ${formatCurrency(totalEntradas)}
*Saídas (Total)*: ${formatCurrency(totalSaidas)}
*Saldo Atual (Entradas - Saídas)*: ${formatCurrency(saldo)}`;

        await message.reply(summaryMessage);

        return true;
    } catch (error) {
        console.error('Erro ao buscar resumo financeiro no Spring Boot:', error.response ? error.response.data : error.message);

        let errorMessage = 'Erro desconhecido ao buscar o resumo financeiro.';
        if (error.message.includes('ECONNREFUSED')) {
            errorMessage = 'Conexão recusada. O Spring Boot não está rodando no endereço especificado.';
        } else if (error.response && (error.response.status === 404 || error.response.status === 500)) {
            errorMessage = 'O endpoint da API para resumo não foi encontrado ou houve erro no servidor. Verifique se o backend está implementado para os endpoints `/entradas/total` e `/saidas/total` ou se há algum problema interno.';
        } else if (error.response && error.response.status === 400) {
            errorMessage = 'Requisição inválida (400). Verifique se o ID de usuário está correto.';
        }
        
        message.reply(`❌ Ocorreu um erro: ${errorMessage}\n\nO que deseja fazer agora? Digite *MENU* para ver as opções.`);
        return false;
    }
}

/**
 * Busca e envia as transações detalhadas para o usuário.
 * Assumimos que GET para /api/entradas ou /api/saidas retorna uma lista.
 * @param {Message} message - O objeto 'message' ORIGINAL do whatsapp-web.js
 * @param {'entradas'|'saidas'} type - O tipo de transação a buscar.
 */
async function getDetailedTransactions(message, type) {
    const whatsappId = message.from;
    const userId = userMap[whatsappId];
    const typeLabel = type === 'entradas' ? 'Entradas (Receitas)' : 'Saídas (Despesas)';
    const endpoint = `/${type}`;

    try {
        const url = `${API_BASE_URL}${endpoint}?userId=${userId}&limit=5`; 
        
        const response = await axios.get(url);
        const transactions = response.data;

        if (!Array.isArray(transactions) || transactions.length === 0) {
            await message.reply(`Você não tem ${typeLabel.toLowerCase()} registradas.`);
            return true;
        }

        const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

        let detailedMessage = `*📋 Últimas ${transactions.slice(0, 5).length} ${typeLabel}*:\n\n`;

        transactions.slice(0, 5).forEach((t, index) => {
            const valor = formatCurrency(t.valor);
            const data = t.data ? new Date(t.data).toLocaleDateString('pt-BR') : 'N/A';
            const descricao = t.descricao || 'Sem descrição';
            
            detailedMessage += `*${index + 1}. ${descricao}*\n`;
            detailedMessage += `  - Valor: ${valor}\n`;
            detailedMessage += `  - Data: ${data}\n`;
            
            if (type === 'entradas') {
                const salario = t.salario ? 'Sim' : 'Não';
                detailedMessage += `  - Salário/Fixo: ${salario}\n`;
            } else {
                const tipo = t.tipo || 'Variável';
                detailedMessage += `  - Tipo: ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}\n`;
            }
            detailedMessage += '---------------------\n';
        });

        await message.reply(detailedMessage);
        return true;

    } catch (error) {
        console.error(`Erro ao buscar ${type} detalhadas no Spring Boot:`, error.response ? error.response.data : error.message);

        let errorMessage = `Erro desconhecido ao buscar ${typeLabel.toLowerCase()}.`;
        if (error.message.includes('ECONNREFUSED')) {
            errorMessage = 'Conexão recusada. O Spring Boot não está rodando no endereço especificado.';
        } else if (error.response && error.response.status === 404) {
            errorMessage = 'O endpoint da API para detalhes não foi encontrado (404). Verifique a implementação de GET para `/api/{entradas|saidas}`.';
        } else if (error.response && error.response.status === 400) {
            errorMessage = 'Requisição inválida (400). Verifique se o ID de usuário está correto.';
        }
        
        message.reply(`❌ Ocorreu um erro: ${errorMessage}`);
        return false;
    }
}


client.on('message', async message => {
    const whatsappId = message.from;
    const body = message.body.trim();
    const bodyLower = body.toLowerCase();
    
    const session = userSessionState[whatsappId];
    const userId = userMap[whatsappId];

    const greetings = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'eai', 'opa', 'ei'];

    if (greetings.includes(bodyLower) && !userId) {
        await message.reply(
`Seja bem vindo(a) ao WhatsApp do FinanZas!
Para usufruir completamente da ferramenta, entre no site https://finanzas-dev.com.br
Realize o login/cadastro. No menu "Configurações", copie o seu "ID de Usuário (UID)".
Cole esse ID aqui no chat da seguinte forma: 

CONECTAR SEU_ID_AQUI`
        );
        userSessionState[whatsappId] = 'awaiting_connect';
        return;
    }

    if (body.toUpperCase().startsWith('CONECTAR ')) {
        const finanzasUserId = body.substring(9).trim();

        if (finanzasUserId.length < 5 || !/^[a-zA-Z0-9]{20,}$/.test(finanzasUserId)) {
            await message.reply('❌ ID de usuário inválido. Verifique o ID no site (Menu > Configurações) e tente novamente. Ex: CONECTAR A1B2C3D4E5...');
            userSessionState[whatsappId] = 'awaiting_connect';
            return;
        }

        userMap[whatsappId] = finanzasUserId;
        userSessionState[whatsappId] = 'in_menu'; 
        await message.reply(`✅ Pronto, agora você está autenticado! \n\nDigite *MENU* para ver as opções.`);
        return;
    }
    
    if (!userId) {
        await message.reply('Olá! Parece que você ainda não se conectou. Envie "oi" ou "olá" para ver as instruções de como começar.');
        return;
    }

    if (bodyLower === 'menu' || bodyLower === 'ajuda') {
        await sendMainMenu(message);
        return;
    }

    if (session === 'in_menu') {
        switch (body) {
            case '1':
                await sendTransactionMenu(message, 'entrada');
                return;
            case '2':
                await sendTransactionMenu(message, 'saida');
                return;
            case '3':
                userSessionState[whatsappId] = 'fetching_summary';
                await message.reply('Buscando seu resumo financeiro... Aguarde um momento.');
                const success = await getFinancialSummary(message);
                
                if (success) {
                    await sendMainMenu(message);
                }
                return;
            case '4':
                delete userMap[whatsappId];
                delete userSessionState[whatsappId];
                await message.reply('Sessão encerrada. Você foi desconectado. 👋\n\nPara usar o bot novamente, envie "oi".');
                return;
            default:
                await message.reply('Opção inválida. Por favor, digite *MENU* para ver as opções novamente.');
                return;
        }
    }

    if (session === 'awaiting_entrada_action' || session === 'awaiting_saida_action') {
        const type = session === 'awaiting_entrada_action' ? 'entrada' : 'saida';
        const isEntrada = type === 'entrada';
        
        switch (body) {
            case '1':
                userSessionState[whatsappId] = isEntrada ? 'awaiting_entrada' : 'awaiting_saida';
                await message.reply(`Ok, vamos registrar uma *${isEntrada ? 'Entrada' : 'Saída'}*.\n\nPor favor, digite o *valor* e a *descrição*.\n(Ex: ${isEntrada ? '2000 salário' : '45 almoço'})`);
                return;
            case '2':
                userSessionState[whatsappId] = 'fetching_details';
                await message.reply('Buscando seus registros detalhados... Aguarde um momento.');
                await getDetailedTransactions(message, isEntrada ? 'entradas' : 'saidas');
                
                await sendTransactionMenu(message, type);
                return;
            case '3':
                await sendMainMenu(message);
                return;
            default:
                await message.reply('Opção inválida. Por favor, digite *1*, *2* ou *3*.');
                return;
        }
    }

    if (session === 'awaiting_entrada') {
        const textToProcess = 'entrada ' + body;

        const success = await processTransaction(message, textToProcess);

        if (success) {
            await sendTransactionMenu(message, 'entrada'); 
        } else {
            userSessionState[whatsappId] = 'awaiting_entrada';
        }
        
        return;
    }

    if (session === 'awaiting_saida') {
        const textToProcess = 'saida ' + body;
        const success = await processTransaction(message, textToProcess);

        if (success) {
            await sendTransactionMenu(message, 'saida'); 
        } else {
            userSessionState[whatsappId] = 'awaiting_saida';
        }
        return;
    }

    await message.reply('Comando não reconhecido. Digite *MENU* para ver a lista de opções.');
});


client.initialize();


app.use(express.json());

app.listen(PORT, () => {
    
});