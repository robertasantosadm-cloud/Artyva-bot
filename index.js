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

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const sessions = {};
const pausados = {};

// ── HORARIO DE ATENDIMENTO ──────────────────────────────
// Seg=1, Ter=2, Qua=3, Qui=4, Sex=5, Sab=6, Dom=0
const DIAS_ATENDIMENTO = [1, 2, 3, 4, 5]; // seg a sex
const HORA_INICIO = 9;
const HORA_FIM = 18;
const FUSO = -3; // horario de Brasilia (UTC-3)

function dentroDoHorario() {
  const agora = new Date();
  const utc = agora.getTime() + agora.getTimezoneOffset() * 60000;
  const brasilia = new Date(utc + 3600000 * FUSO);
  const dia = brasilia.getDay();
  const hora = brasilia.getHours();
  return DIAS_ATENDIMENTO.includes(dia) && hora >= HORA_INICIO && hora < HORA_FIM;
}

// ── HELPERS ────────────────────────────────────────────
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

// ── FLUXO PRINCIPAL ────────────────────────────────────
async function processMessage(from, text) {
  const msg = text.trim().toLowerCase();

  // Reativa bot com #bot
  if (msg === '#bot') {
    pausados[from] = false;
    sessions[from] = { phase: 'aguarda_menu' };
    await send(from,
      'Ola! Como posso te ajudar? \n\n' +
      '1 - Diagnostico gratuito\n' +
      '2 - Servicos e investimento\n' +
      '3 - Agendar visita\n' +
      '4 - Falar com a Roberta'
    );
    return;
  }

  // Se pausado para este contato, nao responde
  if (pausados[from]) {
    console.log('PAUSADO para:', from);
    return;
  }

  // Inicia sessao se nao existir
  if (!sessions[from]) {
    sessions[from] = { phase: 'menu' };
  }
  const s = sessions[from];

  // Cliente recorrente manda oi/ola/menu — mostra menu sem reiniciar do zero
  const saudacoes = ['oi', 'ola', 'olá', 'oii', 'boa tarde', 'bom dia', 'boa noite', 'menu', 'inicio', 'início'];
  if (saudacoes.includes(msg) && s.phase !== 'menu') {
    s.phase = 'aguarda_menu';
    await send(from,
      'Ola de novo! Como posso te ajudar?\n\n' +
      '1 - Diagnostico gratuito\n' +
      '2 - Servicos e investimento\n' +
      '3 - Agendar visita\n' +
      '4 - Falar com a Roberta'
    );
    return;
  }

  // ── MENU PRINCIPAL ──
  if (s.phase === 'menu') {
    await send(from,
      'Ola! Seja bem-vindo(a) a Artyva!\n\n' +
      'Sou a Arty, assistente virtual da Roberta.\n\n' +
      'Como posso te ajudar hoje?\n\n' +
      '1 - Quero fazer um diagnostico gratuito\n' +
      '2 - Conhecer servicos e investimento\n' +
      '3 - Agendar uma visita com a Roberta\n' +
      '4 - Falar diretamente com a Roberta'
    );
    s.phase = 'aguarda_menu';
    return;
  }

  // ── AGUARDA MENU ──
  if (s.phase === 'aguarda_menu') {

    if (msg === '1' || msg.includes('diagnos')) {
      s.phase = 'diag_empresa';
      await send(from,
        'Que otima escolha! O diagnostico da Artyva e 100% gratuito!\n\n' +
        'Vou gerar um formulario personalizado pra voce agora.\n\n' +
        'Qual e o nome da sua empresa ou negocio?'
      );

    } else if (msg === '2' || msg.includes('servi')) {
      await send(from,
        'A Artyva oferece assessoria completa em 4 pilares:\n\n' +
        'Gestao Financeira - DRE, fluxo de caixa\n\n' +
        'Gestao Administrativa - processos e organizacao\n\n' +
        'Gestao de Pessoas - time e cultura\n\n' +
        'Consultoria Estrategica - metas e indicadores\n\n' +
        'Cada proposta e 100% personalizada apos diagnostico gratuito!\n\n' +
        'Digite 1 para diagnostico ou 4 para falar com a Roberta.'
      );

    } else if (msg === '3' || msg.includes('agend')) {
      s.phase = 'agendar';
      await send(from,
        'Com prazer! A Roberta adora conhecer cada empreendedor pessoalmente!\n\n' +
        'Me passa seu nome e empresa que ela entra em contato para confirmar o melhor horario:'
      );

    } else if (msg === '4' || msg.includes('roberta') || msg.includes('humano') || msg.includes('atendente')) {
      
      if (dentroDoHorario()) {
        // Dentro do horario — pausa bot e avisa que Roberta vai atender
        pausados[from] = true;
        s.phase = 'menu';
        await send(from,
          'Claro! Vou avisar a Roberta que voce quer falar com ela.\n\n' +
          'Ela esta disponivel e vai entrar em contato em breve!\n\n' +
          'Telefone: (11) 2368-4091\n' +
          'Email: artyva@artyva.com.br'
        );
      } else {
        // Fora do horario — avisa e continua disponivel para diagnostico
        await send(from,
          'No momento a Roberta esta fora do horario de atendimento.\n\n' +
          'Nosso horario e segunda a sexta, das 9h as 18h.\n\n' +
          'Voce pode:\n' +
          '1 - Fazer o diagnostico gratuito agora (respondo na hora!)\n' +
          '3 - Agendar uma visita\n\n' +
          'A Roberta vai entrar em contato no proximo dia util!\n\n' +
          'Telefone: (11) 2368-4091\n' +
          'Email: artyva@artyva.com.br'
        );
      }

    } else {
      await send(from,
        'Nao entendi. Digite o numero da opcao desejada:\n\n' +
        '1 - Diagnostico gratuito\n' +
        '2 - Servicos e investimento\n' +
        '3 - Agendar visita\n' +
        '4 - Falar com a Roberta'
      );
    }
    return;
  }

  // ── DIAGNOSTICO ──
  if (s.phase === 'diag_empresa') {
    s.empresa = text.trim();
    s.phase = 'diag_segmento';
    await send(from,
      s.empresa + ' - que nome bonito!\n\n' +
      'Qual e o segmento do seu negocio?\n\n' +
      '1 - Varejo / Comercio\n' +
      '2 - Alimentacao / Restaurante\n' +
      '3 - Servicos\n' +
      '4 - Construcao Civil\n' +
      '5 - Saude / Bem-estar\n' +
      '6 - Industria\n' +
      '7 - Outro'
    );
    return;
  }

  if (s.phase === 'diag_segmento') {
    const segs = {
      '1': 'Varejo', '2': 'Alimentacao', '3': 'Servicos',
      '4': 'Construcao Civil', '5': 'Saude', '6': 'Industria', '7': 'Outro'
    };
    s.segmento = segs[msg] || text.trim();
    s.phase = 'diag_zap';
    await send(from,
      'Perfeito!\n\n' +
      'Ultima pergunta: qual e o seu WhatsApp com DDD?\n' +
      'A Roberta vai te contatar apos analisar o diagnostico.'
    );
    return;
  }

  if (s.phase === 'diag_zap') {
    s.zap = text.trim();
    s.phase = 'aguarda_menu';
    await send(from, 'Anotado! Salvando seus dados e gerando seu link...');
    const id = await salvarCliente(s.empresa, s.segmento, s.zap);
    await send(from,
      'Pronto! Seu diagnostico personalizado esta salvo!\n\n' +
      'Seu link exclusivo:\n' +
      `https://diagnostico.artyva.com.br/formulario.html?id=${id}\n\n` +
      `Ao preencher, a Roberta vai analisar os dados de ${s.empresa} e entrar em contato no WhatsApp ${s.zap}!`
    );
    await send(from,
      'Posso te ajudar em mais alguma coisa?\n\n' +
      '1 - Diagnostico\n' +
      '2 - Servicos\n' +
      '3 - Agendar\n' +
      '4 - Falar com Roberta'
    );
    return;
  }

  // ── AGENDAMENTO ──
  if (s.phase === 'agendar') {
    s.phase = 'aguarda_menu';
    await send(from,
      'Anotado! A Roberta vai entrar em contato em breve para confirmar o horario.\n\n' +
      'Telefone: (11) 2368-4091'
    );
    return;
  }

  // ── FALLBACK ──
  s.phase = 'aguarda_menu';
  await send(from,
    'Ola! Como posso te ajudar?\n\n' +
    '1 - Diagnostico gratuito\n' +
    '2 - Servicos\n' +
    '3 - Agendar\n' +
    '4 - Falar com Roberta'
  );
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
      from = String(inp.user || inp.remoteJid || '').replace('@s.whatsapp.net', '').replace('@g.us', '').trim();
      text = String(body.query || inp.query || '').trim();
    }

    // Roberta respondeu manualmente
    if (fromMe && from) {
      if (text === '#bot') {
        pausados[from] = false;
        console.log('Bot REATIVADO para:', from);
      } else if (text !== '') {
        pausados[from] = true;
        console.log('Bot PAUSADO para:', from, '(Roberta respondeu)');
      }
      return res.sendStatus(200);
    }

    if (!from || !text) {
      console.log('IGNORADO');
      return res.sendStatus(200);
    }

    console.log('FROM:', from, '| TEXT:', text, '| Horario:', dentroDoHorario());
    await processMessage(from, text);
    res.sendStatus(200);
  } catch (e) {
    console.error('ERRO:', e.message);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Artyva Bot rodando!' });
});

app.listen(PORT, () => {
  console.log('Artyva Bot porta', PORT);
});
