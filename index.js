const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const axios = require("axios");

const API_BASE_URL =
    process.env.API_BASE_URL || "https://finanzas-backend-rmik.onrender.com/api";
const BOT_API_KEY = process.env.BOT_API_KEY;
const SITE_URL = process.env.SITE_URL || "https://finanzas.dev.br";
const TZ = "America/Sao_Paulo";

if (!BOT_API_KEY) {
    console.error("❌ Defina a variável de ambiente BOT_API_KEY antes de iniciar o bot.");
    process.exit(1);
}

const api = axios.create({ baseURL: API_BASE_URL, timeout: 30000 });
const apiHeaders = (whatsappId) => ({
    "X-Bot-Key": BOT_API_KEY,
    "X-Whatsapp-Id": whatsappId,
});

const vinculados = new Set();
const ultimaTransacao = {};

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "finanzas-bot" }),
    puppeteer: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
});

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
    console.log("QR RECEIVED. Scan this QR code with your WhatsApp linked devices.");
});

client.on("ready", () => {
    console.log("✅ WhatsApp Client está pronto! O bot está conectado e pronto para receber mensagens.");
    console.log(`Conectando ao backend em: ${API_BASE_URL}`);
});

client.on("auth_failure", (msg) => {
    console.error("❌ Falha na Autenticação:", msg);
});

client.on("disconnected", (reason) => {
    console.log("Cliente desconectado", reason);
    client.initialize();
});

const formatCurrency = (value) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const semAcento = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // AAAA-MM-DD
const mesAtualSP = () => hojeSP().slice(0, 7);
const formatarDataBR = (iso) => iso.split("-").reverse().join("/");

const somarDias = (iso, dias) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
};

const CATEGORIAS_SAIDA = {
    alimentacao: {
        icone: "🍽️",
        nome: "Alimentação",
        palavras: ["mercado", "supermercado", "padaria", "restaurante", "lanche", "almoco", "jantar", "cafe", "pizza", "ifood", "comida", "coca", "refrigerante", "bebida", "acai", "hamburguer", "feira", "acougue", "sorvete", "delivery", "marmita", "agua", "suco", "cerveja"],
    },
    transporte: {
        icone: "🚗",
        nome: "Transporte",
        palavras: ["uber", "taxi", "onibus", "metro", "gasolina", "combustivel", "estacionamento", "pedagio", "passagem", "oficina", "ipva", "corrida", "etanol", "trem"],
    },
    moradia: {
        icone: "🏠",
        nome: "Moradia",
        palavras: ["aluguel", "condominio", "luz", "energia", "gas", "iptu", "internet", "reforma", "moveis", "limpeza"],
    },
    lazer: {
        icone: "🎮",
        nome: "Lazer",
        palavras: ["cinema", "bar", "festa", "show", "jogo", "viagem", "passeio", "balada", "ingresso", "parque", "hotel", "game"],
    },
    saude: {
        icone: "💊",
        nome: "Saúde",
        palavras: ["farmacia", "remedio", "medico", "consulta", "dentista", "exame", "hospital", "psicologo", "academia", "plano", "vacina"],
    },
    educacao: {
        icone: "📚",
        nome: "Educação",
        palavras: ["curso", "faculdade", "escola", "livro", "mensalidade", "matricula", "udemy", "apostila", "material"],
    },
    assinaturas: {
        icone: "📺",
        nome: "Assinaturas",
        palavras: ["netflix", "spotify", "disney", "prime", "hbo", "youtube", "icloud", "assinatura", "deezer", "globoplay", "max"],
    },
    outros: { icone: "💸", nome: "Outros", palavras: [] },
};

const CATEGORIAS_ENTRADA = {
    salario: {
        icone: "💼",
        nome: "Salário",
        palavras: ["salario", "ordenado", "holerite", "ferias", "13o", "decimo"],
    },
    freelance: {
        icone: "💻",
        nome: "Freelance",
        palavras: ["freela", "freelance", "freelancer", "bico", "servico", "projeto"],
    },
    investimento: {
        icone: "📈",
        nome: "Investimento",
        palavras: ["rendimento", "dividendo", "dividendos", "juros", "cdb", "tesouro", "fii", "acoes", "lucro"],
    },
    presente: {
        icone: "🎁",
        nome: "Presente",
        palavras: ["presente", "mesada", "doacao", "premio", "aniversario"],
    },
    reembolso: {
        icone: "↩️",
        nome: "Reembolso",
        palavras: ["reembolso", "estorno", "devolucao", "cashback"],
    },
    outros: { icone: "💰", nome: "Outros", palavras: [] },
};

const PALAVRAS_FIXAS = [
    "aluguel", "condominio", "luz", "energia", "agua", "internet", "iptu", "netflix", "spotify",
    "disney", "prime", "hbo", "youtube", "icloud", "globoplay", "deezer", "assinatura",
    "mensalidade", "seguro", "financiamento", "parcela", "fixa", "fixo",
];

const palavrasDe = (descNorm) => descNorm.split(/[^a-z0-9]+/).filter(Boolean);

function inferirCategoria(mapa, descNorm) {
    const palavras = palavrasDe(descNorm);
    for (const [chave, cfg] of Object.entries(mapa)) {
        if (palavras.some((p) => cfg.palavras.includes(p))) return chave;
    }
    return null;
}

const PALAVRAS_SAIDA = new Set(["saida", "saidas", "gasto", "gastei", "despesa", "paguei", "comprei", "compra", "debito"]);
const PALAVRAS_ENTRADA = new Set(["entrada", "entradas", "recebi", "ganhei", "receita", "recebimento", "credito"]);
const RUIDO = new Set(["r$", "reais", "real"]);

function parseValor(tok) {
    const t = tok.replace(/^r\$/i, "");
    if (!/^\d[\d.,]*$/.test(t)) return null;

    let limpo;
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) {
        limpo = t.replace(/\./g, "").replace(",", ".");
    } else if (/^\d+(,\d{1,2})?$/.test(t)) {
        limpo = t.replace(",", ".");
    } else if (/^\d+\.\d{1,2}$/.test(t)) {
        limpo = t; // 35.50
    } else {
        return null;
    }

    const v = Number(limpo);
    return v > 0 && v < 1e9 ? Math.round(v * 100) / 100 : null;
}

function parseData(norm) {
    const hoje = hojeSP();
    if (norm === "hoje") return hoje;
    if (norm === "ontem") return somarDias(hoje, -1);
    if (norm === "anteontem") return somarDias(hoje, -2);

    const m = norm.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
    if (!m) return null;

    const dia = Number(m[1]);
    const mes = Number(m[2]);
    let ano = m[3] ? Number(m[3]) : Number(hoje.slice(0, 4));
    if (m[3] && m[3].length === 2) ano += 2000;

    const teste = new Date(Date.UTC(ano, mes - 1, dia));
    if (teste.getUTCFullYear() !== ano || teste.getUTCMonth() !== mes - 1 || teste.getUTCDate() !== dia) {
        return null;
    }

    let iso = teste.toISOString().slice(0, 10);
    if (!m[3] && iso > hoje) iso = `${ano - 1}-${iso.slice(5)}`;
    return iso;
}

function interpretarTransacao(texto) {
    const tokens = texto.trim().replace(/\s+/g, " ").split(" ");
    let tipo = null;
    let valor = null;
    let dataISO = null;
    const descTokens = [];

    for (const tok of tokens) {
        const norm = semAcento(tok.toLowerCase());

        if (RUIDO.has(norm)) continue;
        if (!tipo && PALAVRAS_SAIDA.has(norm)) { tipo = "saida"; continue; }
        if (!tipo && PALAVRAS_ENTRADA.has(norm)) { tipo = "entrada"; continue; }
        if (valor === null) {
            const v = parseValor(tok);
            if (v !== null) { valor = v; continue; }
        }
        if (!dataISO) {
            const d = parseData(norm);
            if (d) { dataISO = d; continue; }
        }
        descTokens.push(tok);
    }

    if (valor === null) return null;

    // "gastei 35 no mercado" -> tira a preposição do começo da descrição
    let descricao = descTokens.join(" ").replace(/^((no|na|nos|nas|em|de|do|da|com|para|pra|pro|um|uma)\s+)+/i, "").trim();
    if (descricao) descricao = descricao.charAt(0).toUpperCase() + descricao.slice(1);

    return { tipo, valor, dataISO, descricao };
}

async function verificarVinculo(whatsappId) {
    if (vinculados.has(whatsappId)) return true;
    try {
        await api.get("/whatsapp/status", { headers: apiHeaders(whatsappId) });
        vinculados.add(whatsappId);
        return true;
    } catch (error) {
        if (error.response?.status === 401 && error.response.data?.erro === "nao_vinculado") {
            return false;
        }
        throw error;
    }
}

async function tratarDesvinculo(error, message) {
    if (error.response?.status === 401 && error.response.data?.erro === "nao_vinculado") {
        vinculados.delete(message.from);
        delete ultimaTransacao[message.from];
        await message.reply('Sua conta foi desconectada. Envie "oi" para conectar novamente.');
        return true;
    }
    return false;
}

async function conectar(message, body) {
    const whatsappId = message.from;
    const codigo = body
        .replace(/^conectar/i, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase();

    if (codigo.length !== 6) {
        await message.reply(
            "❌ Código inválido. No site, vá em *Configurações*, clique em *Gerar código de conexão* e envie aqui:\n\nCONECTAR SEU_CODIGO"
        );
        return;
    }

    try {
        await api.post("/whatsapp/vincular", { codigo }, { headers: apiHeaders(whatsappId) });
        vinculados.add(whatsappId);
        await message.reply(`✅ Pronto, você está conectado!\n\n${textoAjuda()}`);
    } catch (error) {
        const erro = error.response?.data?.erro;
        if (erro === "muitas_tentativas") {
            await message.reply("⛔ Muitas tentativas incorretas. Aguarde 10 minutos e gere um novo código no site.");
        } else if (erro === "codigo_invalido") {
            await message.reply("❌ Código inválido ou expirado. Gere um novo código no site (Configurações) e tente de novo.");
        } else {
            console.error("Erro ao vincular:", error.response?.data || error.message);
            await message.reply("⚠️ Não consegui concluir a conexão agora. Tente novamente em instantes.");
        }
    }
}

const textoBoasVindas = () =>
    `Seja bem-vindo(a) ao WhatsApp do FinanZas! 💰
Para usar, entre no site ${SITE_URL}, faça login e, em *Configurações*, clique em *Gerar código de conexão*.
Depois envie o código aqui, assim:

CONECTAR SEU_CODIGO`;

const textoAjuda = () =>
    `*FinanZas* 💰
Registre tudo em uma mensagem:

• 35 saida coca-cola
• saida 120 mercado
• gastei 45 uber ontem
• entrada 2000 salário
• recebi 300 freela 10/10

*Comandos*
• *saldo*: resumo do mês
• *extrato*: últimos lançamentos
• *desfazer*: apaga o último lançamento
• *ajuda*: esta mensagem
• *desconectar*: desvincula o WhatsApp`;

const textoNaoEntendi = () =>
    `Não entendi 🤔
Tente assim: *35 saida coca-cola* ou *entrada 2000 salário*.
Envie *ajuda* para ver mais exemplos.`;

async function avisoOrcamento(whatsappId, categoria) {
    try {
        const headers = apiHeaders(whatsappId);
        const [orcamentos, saidas] = await Promise.all([
            api.get("/orcamentos", { headers }),
            api.get("/saidas", { headers }),
        ]);

        const orcamento = orcamentos.data.find((o) => o.categoria === categoria);
        if (!orcamento) return null;

        const limite = Number(orcamento.limite);
        const mes = mesAtualSP();
        const gasto = saidas.data
            .filter((s) => !s.metaId && (s.categoria || "outros") === categoria && String(s.data).startsWith(mes))
            .reduce((acc, s) => acc + Number(s.valor), 0);

        const pct = (gasto / limite) * 100;
        const nome = CATEGORIAS_SAIDA[categoria].nome;

        if (pct >= 100) {
            return `🚨 Orçamento de *${nome}* estourado: ${formatCurrency(gasto)} de ${formatCurrency(limite)} (${Math.round(pct)}%).`;
        }
        if (pct >= 80) {
            return `⚠️ Orçamento de *${nome}* em ${Math.round(pct)}%: ${formatCurrency(gasto)} de ${formatCurrency(limite)}.`;
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function registrar(message, t) {
    const whatsappId = message.from;
    const descNorm = semAcento((t.descricao || "").toLowerCase());

    const tipo = t.tipo || (inferirCategoria(CATEGORIAS_ENTRADA, descNorm) ? "entrada" : "saida");
    const isEntrada = tipo === "entrada";

    const descricao = (t.descricao || (isEntrada ? "Entrada via WhatsApp" : "Saída via WhatsApp")).slice(0, 255);
    const data = t.dataISO || hojeSP();

    let categoria;
    let payload;
    if (isEntrada) {
        categoria = inferirCategoria(CATEGORIAS_ENTRADA, descNorm) || "outros";
        payload = { descricao, valor: t.valor, data, categoria };
    } else {
        categoria = inferirCategoria(CATEGORIAS_SAIDA, descNorm) || "outros";
        const fixa = palavrasDe(descNorm).some((p) => PALAVRAS_FIXAS.includes(p));
        payload = { descricao, valor: t.valor, data, categoria, tipo: fixa ? "fixa" : "variável" };
    }

    try {
        const resposta = await api.post(isEntrada ? "/entradas" : "/saidas", payload, {
            headers: apiHeaders(whatsappId),
        });
        ultimaTransacao[whatsappId] = { tipo, id: resposta.data.id };

        const cfg = (isEntrada ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA)[categoria];
        const quando = data === hojeSP() ? "hoje" : formatarDataBR(data);
        const detalhe = isEntrada ? `${cfg.icone} ${cfg.nome}` : `${cfg.icone} ${cfg.nome} · ${payload.tipo}`;

        await message.reply(
            `✅ *${isEntrada ? "Entrada" : "Saída"} registrada!*
${isEntrada ? "💰" : "💸"} ${formatCurrency(t.valor)} · ${descricao}
${detalhe} · ${quando}

Errou? Envie *desfazer*.`
        );

        // Alerta de orçamento (só para saídas do mês atual)
        if (!isEntrada && data.startsWith(mesAtualSP())) {
            const aviso = await avisoOrcamento(whatsappId, categoria);
            if (aviso) await message.reply(aviso);
        }
    } catch (error) {
        if (await tratarDesvinculo(error, message)) return;

        console.error("Erro ao registrar:", error.response?.data || error.message);
        if (error.response?.status === 400) {
            await message.reply("❌ Não consegui registrar: confira o valor e a descrição.");
        } else {
            await message.reply("⚠️ Não consegui registrar agora. Tente novamente em instantes.");
        }
    }
}

async function desfazer(message) {
    const whatsappId = message.from;
    const ultima = ultimaTransacao[whatsappId];

    if (!ultima) {
        await message.reply("Não encontrei um lançamento recente para desfazer.");
        return;
    }

    try {
        const rota = ultima.tipo === "entrada" ? "entradas" : "saidas";
        await api.delete(`/${rota}/${ultima.id}`, { headers: apiHeaders(whatsappId) });
        delete ultimaTransacao[whatsappId];
        await message.reply("↩️ Lançamento desfeito.");
    } catch (error) {
        if (await tratarDesvinculo(error, message)) return;

        if (error.response?.status === 404) {
            delete ultimaTransacao[whatsappId];
            await message.reply("Esse lançamento já não existe mais.");
        } else {
            console.error("Erro ao desfazer:", error.response?.data || error.message);
            await message.reply("⚠️ Não consegui desfazer agora. Tente novamente em instantes.");
        }
    }
}

async function resumoDoMes(message) {
    const headers = apiHeaders(message.from);
    try {
        const [e, s] = await Promise.all([
            api.get("/entradas", { headers }),
            api.get("/saidas", { headers }),
        ]);

        const mes = mesAtualSP();
        const doMes = (x) => String(x.data || "").startsWith(mes);
        const soma = (arr) => arr.reduce((acc, x) => acc + Number(x.valor), 0);

        const entradas = e.data.filter(doMes);
        const saidas = s.data.filter(doMes);
        const gastos = saidas.filter((x) => !x.metaId);
        const aportes = soma(saidas.filter((x) => x.metaId));

        const totalEntradas = soma(entradas);
        const totalGastos = soma(gastos);
        const saldo = totalEntradas - totalGastos - aportes;

        const porCategoria = {};
        gastos.forEach((x) => {
            const c = CATEGORIAS_SAIDA[x.categoria] ? x.categoria : "outros";
            porCategoria[c] = (porCategoria[c] || 0) + Number(x.valor);
        });
        const top = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).slice(0, 3);

        const nomeMes = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: TZ });

        let texto = `*📊 Resumo de ${nomeMes}*

💰 Entradas: ${formatCurrency(totalEntradas)}
💸 Saídas: ${formatCurrency(totalGastos)}`;
        if (aportes > 0) texto += `\n🎯 Guardado em metas: ${formatCurrency(aportes)}`;
        texto += `\n💎 *Saldo: ${formatCurrency(saldo)}*`;

        if (top.length > 0) {
            texto += "\n\n*Maiores gastos*";
            top.forEach(([c, v]) => {
                texto += `\n${CATEGORIAS_SAIDA[c].icone} ${CATEGORIAS_SAIDA[c].nome}: ${formatCurrency(v)}`;
            });
        }

        await message.reply(texto);
    } catch (error) {
        if (await tratarDesvinculo(error, message)) return;
        console.error("Erro no resumo:", error.response?.data || error.message);
        await message.reply("⚠️ Não consegui buscar o resumo agora. Tente novamente em instantes.");
    }
}

async function extrato(message) {
    const headers = apiHeaders(message.from);
    try {
        const [e, s] = await Promise.all([
            api.get("/entradas", { headers }),
            api.get("/saidas", { headers }),
        ]);

        const todos = [
            ...e.data.map((x) => ({ ...x, _tipo: "entrada" })),
            ...s.data.map((x) => ({ ...x, _tipo: "saida" })),
        ]
            .filter((x) => x.data)
            .sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id)
            .slice(0, 8);

        if (todos.length === 0) {
            await message.reply("Você ainda não tem lançamentos.");
            return;
        }

        let texto = "*🕐 Últimos lançamentos*\n";
        todos.forEach((x) => {
            const sinal = x._tipo === "entrada" ? "💰 +" : "💸 -";
            const dia = formatarDataBR(x.data).slice(0, 5);
            texto += `\n${sinal}${formatCurrency(x.valor)} · ${x.descricao || "Sem descrição"} · ${dia}`;
        });

        await message.reply(texto);
    } catch (error) {
        if (await tratarDesvinculo(error, message)) return;
        console.error("Erro no extrato:", error.response?.data || error.message);
        await message.reply("⚠️ Não consegui buscar o extrato agora. Tente novamente em instantes.");
    }
}

async function desconectar(message) {
    const whatsappId = message.from;
    try {
        await api.delete("/whatsapp/vinculo", { headers: apiHeaders(whatsappId) });
    } catch (error) {
        console.error("Erro ao desconectar:", error.response?.data || error.message);
    }
    vinculados.delete(whatsappId);
    delete ultimaTransacao[whatsappId];
    await message.reply('Você foi desconectado. 👋\n\nPara usar o bot novamente, envie "oi".');
}

const SAUDACOES = ["oi", "ola", "bom dia", "boa tarde", "boa noite", "eai", "opa", "ei"];

client.on("message", async (message) => {
    if (
        message.fromMe ||
        message.isStatus ||
        message.from === "status@broadcast" ||
        message.from.endsWith("@g.us") ||
        message.type !== "chat"
    ) {
        return;
    }

    const whatsappId = message.from;
    const body = (message.body || "").trim();
    if (!body) return;
    const cmd = semAcento(body.toLowerCase());

    try {
        if (/^conectar(\s|$)/i.test(body)) {
            await conectar(message, body);
            return;
        }

        if (!(await verificarVinculo(whatsappId))) {
            await message.reply(textoBoasVindas());
            return;
        }

        if (["ajuda", "menu", "help", "?", "comandos"].includes(cmd) || SAUDACOES.includes(cmd)) {
            await message.reply(textoAjuda());
            return;
        }
        if (["saldo", "resumo", "mes"].includes(cmd)) {
            await resumoDoMes(message);
            return;
        }
        if (["extrato", "ultimos", "historico"].includes(cmd)) {
            await extrato(message);
            return;
        }
        if (cmd === "desfazer") {
            await desfazer(message);
            return;
        }
        if (["desconectar", "sair"].includes(cmd)) {
            await desconectar(message);
            return;
        }

        // Qualquer outra mensagem: tenta entender como um lançamento
        const transacao = interpretarTransacao(body);
        const temDescricao = transacao && transacao.descricao;
        if (transacao && (transacao.tipo || temDescricao)) {
            await registrar(message, transacao);
            return;
        }

        await message.reply(textoNaoEntendi());
    } catch (error) {
        console.error("Erro ao processar mensagem:", error.response?.data || error.message);
        await message.reply("⚠️ Não consegui falar com o servidor agora. Tente novamente em instantes.");
    }
});

client.initialize();