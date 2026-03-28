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

  if (msg === '#bot') {
    pausados[from] = false;
    sessions[from] = { phase: 'aguarda_menu' };
    await send(from, 'Olá! 😊 Como posso te ajudar?\n\n1️⃣ Diagnóstico gratuito\n2️⃣ Serviços\n3️⃣ Agendar visita\n4️⃣ Falar com a Roberta');
    return;
  }

  if (pausados[from]) {
    console.log('PAUSADO para:', from);
    return;
  }

  if (!sessions[from]) {
    sessions[from] = { phase: 'menu' };
  }
  const s = sessions[from];

  if ((msg === 'oi' || msg === 'olá' || msg === 'ola' || msg === 'menu' || msg === 'inicio' || msg === 'início') && s.phase !== 'menu') {
    s.phase = 'aguarda_menu';
    await send(from, 'Olá de novo! 😊\n\nComo posso te ajudar?\n\n1️⃣ Diagnóstico gratuito\n2️⃣ Serviços\n3️⃣ Agendar visita\n4️⃣ Falar com a Roberta');
    return;
  }

  if (s.phase === 'menu') {
    await send(from,
      'Olá! 👋 Seja bem-vindo(a) à *Artyva*!\n\n' +
      'Sou a *Arty*, assistente virtual da Roberta. 🌿\n\n' +
      'Como posso te ajudar hoje?\n\n' +
      '1️⃣ Quero fazer um diagnóstico gratuito\n' +
      '2️⃣ Conhecer serviços e investimento\n' +
      '3️⃣ Agendar uma visita com a Roberta\n' +
      '4️⃣ Falar diretamente com a Roberta'
    );
    s.phase = 'aguarda_menu';
    return;
  }

  if (s.phase === 'aguarda_menu') {
    if (msg === '1' || msg.includes('diagnos')) {
      s.phase = 'diag_empresa';
      await send(from,
        'Que ótima escolha! 🎉 O diagnóstico da Artyva é *100% gratuito*!\n\n' +
        'Vou gerar um formulário personalizado pra você agora. 😊\n\n' +
        'Qual é o *nome da sua empresa ou negócio*?'
      );
    } else if (msg === '2' || msg.includes('servi')) {
      await send(from,
        'A *Artyva* oferece assessoria completa em 4 pilares:\n\n' +
        '💰 *Gestão Financeira* — DRE, fluxo de caixa\n\n' +
        '⚙️ *Gestão Administrativa* — processos e organização\n\n' +
        '👥 *Gestão de Pessoas* — time e cultura\n\n' +
        '📊 *Consultoria Estratégica* — metas e indicadores\n\n' +
        'Digite *1* para diagnóstico gratuito ou *4* para falar com a Roberta.'
      );
    } else if (msg === '3' || msg.includes('agend')) {
      s.phase = 'agendar';
      await send(from,
        'Com prazer! 📅 A Roberta adora conhecer cada empreendedor pessoalmente!\n\n' +
        'Me passa seu *nome e empresa* que ela entra em contato:'
      );
    } else if (msg === '4' || msg.includes('roberta') || msg.includes('humano') || msg.includes('atendente')) {
      pausados[from] = true;
      s.phase = 'menu';
      await send(from,
        'Claro! 🙋 Vou avisar a *Roberta* que você quer falar com ela.\n\n' +
        '📞 *(11) 2368-4091*\n' +
        '📧 artyva@artyva.com.br\n\n' +
        'Ela vai entrar em contato em breve! 💚'
      );
    } else {
      await send(from,
        'Não entendi. 😊 Digite o número:\n\n' +
        '1️⃣ Diagnóstico gratuito\n' +
        '2️⃣ Serviços\n' +
        '3️⃣ Agendar visita\n' +
        '4️⃣ Falar com a Roberta'
      );
    }
    return;
  }

  if (s.phase === 'diag_empresa') {
    s.empresa = text.trim();
    s.phase = 'diag_segmento';
    await send(from,
      `*${s.empresa}* — que nome bonito! 😊\n\n` +
      'Qual é o *segmento* do seu negócio?\n\n' +
      '1️⃣ Varejo / Comércio\n' +
      '2️⃣ Alimentação / Restaurante\n' +
      '3️⃣ Serviços\n' +
      '4️⃣ Construção Civil\n' +
      '5️⃣ Saúde / Bem-estar\n' +
      '6️⃣ Indústria\n' +
      '7️⃣ Outro'
    );
    return;
  }

  if (s.phase === 'diag_segmento') {
    const segs = { '1': 'Varejo', '2': 'Alimentação', '3': 'Serviços', '4': 'Construção Civil', '5': 'Saúde', '6': 'Indústria', '7': 'Outro' };
    s.segmento = segs[msg] || text.trim();
    s.phase = 'diag_zap';
    await send(from, 'Perfeito! ✅\n\nÚltima pergunta: qual é o seu *WhatsApp* com DDD?\nA Roberta vai te contatar após analisar o diagnóstico. 📱');
    return;
  }

  if (s.phase === 'diag_zap') {
    s.zap = text.trim();
    s.phase = 'aguarda_menu';
    await send(from, 'Anotado! 📝 Salvando seus dados e gerando seu link...');
    const id = await salvarCliente(s.empresa, s.segmento, s.zap);
    await send(from,
      'Pronto! ✅ Seu diagnóstico personalizado está salvo!\n\n' +
      '🔗 *Seu link exclusivo:*\n' +
      `https://diagnostico.artyva.com.br/formulario.html?id=${id}\n\n` +
      `Ao preencher, a *Roberta* vai analisar os dados de *${s.empresa}* e entrar em contato no WhatsApp *${s.zap}*! 🌿`
    );
    await send(from,
      'Posso te ajudar em mais alguma coisa? 😊\n\n' +
      '1️⃣ Diagnóstico\n' +
      '2️⃣ Serviços\n' +
      '3️⃣ Agendar\n' +
      '4️⃣ Falar com Roberta'
    );
    return;
  }

  if (s.phase === 'agendar') {
    s.phase = 'aguarda_menu';
    await send(from, 'Anotado! ✅ A *Roberta* vai entrar em contato em breve. 🌿\n\n📞 (11) 2368-4091');
    return;
  }

  s.phase = 'aguarda_menu';
  await send(from,
    'Olá! 😊\n\n' +
    '1️⃣ Diagnóstico\n' +
    '2️⃣ Serviços\n' +
    '3️⃣ Agendar\n' +
    '4️⃣ Falar com Roberta'
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

    if (fromMe && from) {
      if (text === '#bot') {
        pausados[from] = false;
        console.log('Bot REATIVADO para:', from);
      } else {
        pausados[from] = true;
        console.log('Bot PAUSADO para:', from);
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
  res.json({ status: 'ok', message: 'Artyva Bot rodando! 🌿' });
});

app.listen(PORT, () => {
  console.log('Artyva Bot porta', PORT);
});
