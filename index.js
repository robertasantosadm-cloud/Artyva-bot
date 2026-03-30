const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution-api-production-384c.up.railway.app';
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || '27057fa8106ef94d0f85bc25dceccba9b3cac1fc09906ee3f8f47092e175eeb2';
const INSTANCE = process.env.INSTANCE_NAME || 'Artyva';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bxqqygsuxvmdtjugesng.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_nxOSdcbaQ6uslLiCTVW5Vg_0-tWI3Xj';
const PORT = process.env.PORT || 8080;

const NUMERO_ROBERTA = '551123684091';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const sessions = {};
const pausados = {};
const ultimaInteracao = {};
const ultimaPausa = {};

const DIAS_ATENDIMENTO = [1, 2, 3, 4, 5];
const HORA_INICIO = 9;
const HORA_FIM = 18;
const TEMPO_PAUSA_MS = 3 * 60 * 60 * 1000; // 3 horas

function dentroDoHorario() {
  const agora = new Date();
  const brasilia = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return DIAS_ATENDIMENTO.includes(brasilia.getDay()) &&
    brasilia.getHours() >= HORA_INICIO &&
    brasilia.getHours() < HORA_FIM;
}

function eClienteRecorrente(from) {
  if (!ultimaInteracao[from]) return false;
  return (Date.now() - ultimaInteracao[from]) > TEMPO_PAUSA_MS;
}

function registrarInteracao(from) {
  ultimaInteracao[from] = Date.now();
}

function menuOpcoes() {
  return '1\ufe0f\u20e3 Quero fazer um diagn\u00f3stico gratuito\n' +
    '2\ufe0f\u20e3 Conhecer servi\u00e7os e investimento\n' +
    '3\ufe0f\u20e3 Agendar uma visita com a Roberta\n' +
    '4\ufe0f\u20e3 Falar diretamente com a Roberta';
}

function menuResumido() {
  return '1\ufe0f\u20e3 Diagn\u00f3stico\n' +
    '2\ufe0f\u20e3 Servi\u00e7os\n' +
    '3\ufe0f\u20e3 Agendar\n' +
    '4\ufe0f\u20e3 Falar com a Roberta\n' +
    '_Digite *0* ou *menu* para voltar ao in\u00edcio_';
}

async function send(to, text) {
  try {
    await axios.post(
      `${EVOLUTION_URL}/message/sendText/${INSTANCE}`,
      { number: to, text },
      { headers: { apikey: EVOLUTION_KEY } }
    );
  } catch (e) {
    console.error('Erro ao enviar:', e.message);
  }
}

function gerarId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'ARV-';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

async function salvarCliente(empresa, ramo, zap) {
  const id = gerarId();
  try {
    await sb.from('clientes').insert([{ id, nome: empresa, ramo, zap }]);
  } catch (e) {
    console.error('Erro Supabase:', e.message);
  }
  return id;
}

async function processMessage(from, text) {
  const msg = text.trim().toLowerCase();

  // ── VERIFICA PAUSA ─────────────────────────────────────
  if (pausados[from]) {
    const tempoPassado = ultimaPausa[from] ? (Date.now() - ultimaPausa[from]) : 0;
    if (tempoPassado > TEMPO_PAUSA_MS) {
      pausados[from] = false;
      ultimaPausa[from] = null;
      sessions[from] = { phase: 'aguarda_menu' };
      registrarInteracao(from);
      await send(from,
        'Que bom ter voc\u00ea de volta! \ud83e\udd70 A Roberta vai ficar muito feliz em saber!\n\n' +
        'Como posso te ajudar hoje?\n\n' +
        menuOpcoes()
      );
    } else {
      console.log('PAUSADO para:', from, '| Restante:', Math.round((TEMPO_PAUSA_MS - tempoPassado) / 60000), 'min');
    }
    return;
  }

  // ── VOLTAR AO MENU ─────────────────────────────────────
  if (msg === '0' || msg === 'menu') {
    sessions[from] = { phase: 'aguarda_menu' };
    registrarInteracao(from);
    await send(from, 'Voltando ao menu! \ud83d\ude0a\n\n' + menuOpcoes());
    return;
  }

  // ── CLIENTE RECORRENTE ─────────────────────────────────
  const recorrente = eClienteRecorrente(from);
  registrarInteracao(from);

  if (!sessions[from]) sessions[from] = { phase: 'menu' };
  const s = sessions[from];

  if (recorrente && s.phase !== 'menu') {
    s.phase = 'aguarda_menu';
    await send(from,
      'Que bom ter voc\u00ea de volta! \ud83e\udd70 A Roberta vai ficar muito feliz em saber!\n\n' +
      'Como posso te ajudar hoje?\n\n' +
      menuOpcoes()
    );
    return;
  }

  // ── SAUDACOES ──────────────────────────────────────────
  const saudacoes = ['oi', 'ola', 'ol\u00e1', 'oii', 'boa tarde', 'bom dia', 'boa noite', 'inicio', 'in\u00edcio'];
  if (saudacoes.includes(msg) && s.phase !== 'menu') {
    s.phase = 'aguarda_menu';
    await send(from, 'Ol\u00e1 de novo! \ud83d\ude0a\n\nComo posso te ajudar?\n\n' + menuOpcoes());
    return;
  }

  // ── MENU PRINCIPAL ─────────────────────────────────────
  if (s.phase === 'menu') {
    await send(from,
      'Ol\u00e1! \ud83d\udc4b Seja bem-vindo(a) \u00e0 *Artyva*!\n\n' +
      'Sou a *Arty*, assistente virtual da Roberta. \ud83c\udf3f\n\n' +
      'Como posso te ajudar hoje?\n\n' +
      menuOpcoes()
    );
    s.phase = 'aguarda_menu';
    return;
  }

  // ── AGUARDA ESCOLHA ────────────────────────────────────
  if (s.phase === 'aguarda_menu') {
    if (msg === '1' || msg.includes('diagnos')) {
      s.phase = 'diag_empresa';
      await send(from,
        'Que \u00f3tima escolha! \ud83c\udf89 O diagn\u00f3stico da Artyva \u00e9 *100% gratuito*!\n\n' +
        'Vou gerar um formul\u00e1rio personalizado pra voc\u00ea agora. \ud83d\ude0a\n\n' +
        'Qual \u00e9 o *nome da sua empresa ou neg\u00f3cio*?\n\n' +
        '_Digite *0* para voltar ao menu_'
      );
    } else if (msg === '2' || msg.includes('servi')) {
      await send(from,
        'A *Artyva* oferece assessoria completa em 4 pilares:\n\n' +
        '\ud83d\udcb0 *Gest\u00e3o Financeira* \u2014 DRE, fluxo de caixa\n\n' +
        '\u2699\ufe0f *Gest\u00e3o Administrativa* \u2014 processos e organiza\u00e7\u00e3o\n\n' +
        '\ud83d\udc65 *Gest\u00e3o de Pessoas* \u2014 time e cultura\n\n' +
        '\ud83d\udcca *Consultoria Estrat\u00e9gica* \u2014 metas e indicadores\n\n' +
        'Cada proposta \u00e9 100% personalizada ap\u00f3s diagn\u00f3stico gratuito!\n\n' +
        'Digite *1* para diagn\u00f3stico ou *4* para falar com a Roberta.\n\n' +
        '_Digite *0* para voltar ao menu_'
      );
    } else if (msg === '3' || msg.includes('agend')) {
      s.phase = 'agendar';
      await send(from,
        'Com prazer! \ud83d\udcc5 A Roberta adora conhecer cada empreendedor pessoalmente!\n\n' +
        'Me passa seu *nome e empresa* que ela entra em contato:\n\n' +
        '_Digite *0* para voltar ao menu_'
      );
    } else if (msg === '4' || msg.includes('roberta') || msg.includes('humano') || msg.includes('atendente')) {
      pausados[from] = true;
      ultimaPausa[from] = Date.now();
      s.phase = 'menu';
      if (dentroDoHorario()) {
        await send(from,
          'Claro! \ud83d\ude4b Vou avisar a *Roberta* que voc\u00ea quer falar com ela.\n\n' +
          'Ela est\u00e1 dispon\u00edvel e vai entrar em contato em breve! \ud83d\udc9a\n\n' +
          '\ud83d\udcde *(11) 2368-4091*\n' +
          '\ud83d\udce7 artyva@artyva.com.br'
        );
      } else {
        await send(from,
          'No momento a Roberta est\u00e1 fora do hor\u00e1rio de atendimento. \ud83c\udf19\n\n' +
          'Nosso hor\u00e1rio \u00e9 segunda a sexta, das 9h \u00e0s 18h.\n\n' +
          'A Roberta vai entrar em contato no pr\u00f3ximo dia \u00fatil! \ud83c\udf3f\n\n' +
          '\ud83d\udcde *(11) 2368-4091*\n' +
          '\ud83d\udce7 artyva@artyva.com.br\n\n' +
          'Enquanto isso posso te ajudar:\n' +
          '1\ufe0f\u20e3 Fazer o diagn\u00f3stico gratuito\n' +
          '3\ufe0f\u20e3 Agendar uma visita'
        );
        pausados[from] = false;
        ultimaPausa[from] = null;
        s.phase = 'aguarda_menu';
      }
    } else {
      await send(from, 'N\u00e3o entendi. \ud83d\ude0a Digite o n\u00famero:\n\n' + menuOpcoes());
    }
    return;
  }

  // ── DIAGNOSTICO ────────────────────────────────────────
  if (s.phase === 'diag_empresa') {
    s.empresa = text.trim();
    s.phase = 'diag_segmento';
    await send(from,
      `*${s.empresa}* \u2014 que nome bonito! \ud83d\ude0a\n\n` +
      'Qual \u00e9 o *segmento* do seu neg\u00f3cio?\n\n' +
      '1\ufe0f\u20e3 Varejo / Com\u00e9rcio\n' +
      '2\ufe0f\u20e3 Alimenta\u00e7\u00e3o / Restaurante\n' +
      '3\ufe0f\u20e3 Servi\u00e7os\n' +
      '4\ufe0f\u20e3 Constru\u00e7\u00e3o Civil\n' +
      '5\ufe0f\u20e3 Sa\u00fade / Bem-estar\n' +
      '6\ufe0f\u20e3 Ind\u00fastria\n' +
      '7\ufe0f\u20e3 Outro\n\n' +
      '_Digite *0* para voltar ao menu_'
    );
    return;
  }

  if (s.phase === 'diag_segmento') {
    const segs = {
      '1': 'Varejo', '2': 'Alimenta\u00e7\u00e3o', '3': 'Servi\u00e7os',
      '4': 'Constru\u00e7\u00e3o Civil', '5': 'Sa\u00fade', '6': 'Ind\u00fastria', '7': 'Outro'
    };
    s.segmento = segs[msg] || text.trim();
    s.phase = 'diag_zap';
    await send(from,
      'Perfeito! \u2705\n\n' +
      '\u00daltima pergunta: qual \u00e9 o seu *WhatsApp* com DDD?\n' +
      'A Roberta vai te contatar ap\u00f3s analisar o diagn\u00f3stico. \ud83d\udcf1\n\n' +
      '_Digite *0* para voltar ao menu_'
    );
    return;
  }

  if (s.phase === 'diag_zap') {
    s.zap = text.trim();
    s.phase = 'aguarda_menu';
    await send(from, 'Anotado! \ud83d\udcdd Salvando seus dados e gerando seu link...');
    const id = await salvarCliente(s.empresa, s.segmento, s.zap);
    await send(from,
      'Pronto! \u2705 Seu diagn\u00f3stico personalizado est\u00e1 salvo!\n\n' +
      '\ud83d\udd17 *Seu link exclusivo:*\n' +
      `https://diagnostico.artyva.com.br/formulario.html?id=${id}\n\n` +
      `Ao preencher, a *Roberta* vai analisar os dados de *${s.empresa}* e entrar em contato no WhatsApp *${s.zap}*! \ud83c\udf3f`
    );
    await send(from, 'Posso te ajudar em mais alguma coisa? \ud83d\ude0a\n\n' + menuResumido());
    return;
  }

  // ── AGENDAMENTO ────────────────────────────────────────
  if (s.phase === 'agendar') {
    s.phase = 'aguarda_menu';
    await send(from,
      'Anotado! \u2705 A *Roberta* vai entrar em contato em breve. \ud83c\udf3f\n\n' +
      '\ud83d\udcde (11) 2368-4091\n\n' +
      menuResumido()
    );
    return;
  }

  // ── FALLBACK ───────────────────────────────────────────
  s.phase = 'aguarda_menu';
  await send(from, 'Ol\u00e1! \ud83d\ude0a\n\n' + menuOpcoes());
}

// ── WEBHOOK ────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    console.log('RAW:', JSON.stringify(body).substring(0, 300));

    let from = '';
    let text = '';
    let fromMe = false;

    if (body && body.inputs) {
      const inp = body.inputs;
      fromMe = inp.fromMe === true;
      const remoteJid = String(inp.remoteJid || inp.user || '');

      // Ignora grupos
      if (remoteJid.includes('@g.us')) {
        console.log('GRUPO - ignorado');
        return res.sendStatus(200);
      }

      from = remoteJid.replace('@s.whatsapp.net', '').trim();
      text = String(body.query || inp.query || '').trim();
    }

    if (!from || !text) {
      console.log('IGNORADO - sem from ou text');
      return res.sendStatus(200);
    }

    const msg = text.trim().toLowerCase();

    // ── CONTROLE DA ROBERTA ────────────────────────────
    // Roberta digita #pausa na conversa do cliente
    if (msg === '#pausa' && from === NUMERO_ROBERTA) {
      console.log('IGNORADO - #pausa do proprio numero');
      return res.sendStatus(200);
    }

    // Roberta respondeu manualmente (fromMe=true) — pausa aquele contato por 3h
    if (fromMe) {
      if (msg === '#pausa') {
        pausados[from] = true;
        ultimaPausa[from] = Date.now();
        console.log('PAUSADO via #pausa para:', from);
      } else {
        pausados[from] = true;
        ultimaPausa[from] = Date.now();
        console.log('PAUSADO (Roberta respondeu) para:', from);
      }
      return res.sendStatus(200);
    }

    // Mensagem normal do cliente
    console.log('FROM:', from, '| TEXT:', text, '| Horario:', dentroDoHorario());
    await processMessage(from, text);
    res.sendStatus(200);
  } catch (e) {
    console.error('ERRO:', e.message);
    res.sendStatus(500);
  }
});

// GET /webhook — necessario para o Evolution Bot testar a conexao
app.get('/webhook', (req, res) => {
  res.sendStatus(200);
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Artyva Bot rodando!' });
});

app.listen(PORT, () => {
  console.log('Artyva Bot porta', PORT);
});
