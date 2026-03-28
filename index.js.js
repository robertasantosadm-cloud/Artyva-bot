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
const pausados = {}; // contatos pausados quando Roberta responde

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

  // Reativa bot se cliente digitar #bot
  if (msg === '#bot') {
    pausados[from] = false;
    await send(from, 'Ola! Como posso te ajudar?\n\n1 - Diagnostico gratuito\n2 - Servicos\n3 - Agendar visita\n4 - Falar com a Roberta');
    sessions[from] = { phase: 'aguarda_menu' };
    return;
  }

  // Se pausado, nao responde
  if (pausados[from]) {
    console.log('PAUSADO para:', from);
    return;
  }

  // Inicia sessao se nao existir — mas se ja existia nao reinicia
  if (!sessions[from]) {
    sessions[from] = { phase: 'menu' };
  }
  const s = sessions[from];

  // Se cliente manda oi/ola/inicio e ja estava no meio de algo, oferece continuar
  if ((msg === 'oi' || msg === 'ola' || msg === 'ola!' || msg === 'inicio' || msg === 'menu') && s.phase !== 'menu') {
    await send(from, 'Ola de novo!\n\nComo posso te ajudar?\n\n1 - Diagnostico gratuito\n2 - Servicos\n3 - Agendar visita\n4 - Falar com a Roberta');
    s.phase = 'aguarda_menu';
    return;
  }

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
        'Digite 1 para diagnostico gratuito ou 4 para falar com a Roberta.'
      );
    } else if (msg === '3' || msg.includes('agend')) {
      s.phase = 'agendar';
      await send(from,
        'Com prazer! A Roberta adora conhecer cada empreendedor pessoalmente!\n\n' +
        'Me passa seu nome e empresa que ela entra em contato:'
      );
    } else if (msg === '4' || msg.includes('roberta') || msg.includes('humano') || msg.includes('atendente')) {
      pausados[from] = true; // pausa bot para Roberta atender
      s.phase = 'menu';
      await send(from,
        'Claro! Vou avisar a Roberta que voce quer falar com ela.\n\n' +
        'Telefone: (11) 2368-4091\n' +
        'Email: artyva@artyva.com.br\n\n' +
        'Ela vai entrar em contato em breve!'
      );
    } else {
      await send(from,
        'Nao entendi. Digite o numero:\n\n' +
        '1 - Diagnostico gratuito\n' +
        '2 - Servicos\n' +
        '3 - Agendar visita\n' +
        '4 - Falar com a Roberta'
      );
    }
    return;
  }

  if (s.phase === 'diag_empresa') {
    s.empresa = text.trim();
    s.phase = 'diag_segmento';
    await send(from,
      s.empresa + ' - que nome bonito!\n\n' +
      'Qual o segmento?\n\n' +
      '1 - Varejo\n' +
      '2 - Alimentacao\n' +
      '3 - Servicos\n' +
      '4 - Construcao Civil\n' +
      '5 - Saude\n' +
      '6 - Industria\n' +
      '7 - Outro'
    );
    return;
  }

  if (s.phase === 'diag_segmento') {
    const segs = { '1': 'Varejo', '2': 'Alimentacao', '3': 'Servicos', '4': 'Construcao Civil', '5': 'Saude', '6': 'Industria', '7': 'Outro' };
    s.segmento = segs[msg] || text.trim();
    s.phase = 'diag_zap';
    await send(from, 'Perfeito!\n\nUltima pergunta: qual o seu WhatsApp com DDD?');
    return;
  }

  if (s.phase === 'diag_zap') {
    s.zap = text.trim();
    s.phase = 'aguarda_menu';
    await send(from, 'Anotado! Gerando seu link personalizado...');
    const id = await salvarCliente(s.empresa, s.segmento, s.zap);
    await send(from,
      'Pronto!\n\n' +
      'Seu diagnostico exclusivo:\n' +
      'https://diagnostico.artyva.com.br/formulario.html?id=' + id + '\n\n' +
      'A Roberta vai analisar os dados de ' + s.empresa + ' e entrar em contato!'
    );
    await send(from,
      'Posso ajudar em mais algo?\n\n' +
      '1 - Diagnostico\n' +
      '2 - Servicos\n' +
      '3 - Agendar\n' +
      '4 - Falar com Roberta'
    );
    return;
  }

  if (s.phase === 'agendar') {
    s.phase = 'aguarda_menu';
    await send(from, 'Anotado! A Roberta vai entrar em contato em breve.\n\nTelefone: (11) 2368-4091');
    return;
  }

  s.phase = 'aguarda_menu';
  await send(from,
    'Ola!\n\n' +
    '1 - Diagnostico\n' +
    '2 - Servicos\n' +
    '3 - Agendar\n' +
    '4 - Falar com Roberta'
  );
}

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

    // Se Roberta respondeu manualmente, pausa o bot para aquele contato
    if (fromMe && from && text) {
      if (text === '#bot') {
        // Reativa o bot
        pausados[from] = false;
        console.log('Bot REATIVADO para:', from);
      } else {
        // Pausa o bot
        pausados[from] = true;
        console.log('Bot PAUSADO para:', from, '(Roberta respondeu)');
      }
      return res.sendStatus(200);
    }

    if (!from || !text) {
      console.log('IGNORADO');
      return res.sendStatus(200);
    }

    console.log('FROM:', from, '| TEXT:', text);
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
