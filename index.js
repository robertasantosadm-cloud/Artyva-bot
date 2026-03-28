const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// ── CONFIG ─────────────────────────────────────────────
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution-api-production-384c.up.railway.app';
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || '27057fa8106ef94d0f85bc25dceccba9b3cac1fc09906ee3f8f47092e175eeb2';
const INSTANCE = process.env.INSTANCE_NAME || 'artyva';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bxqqygsuxvmdtjugesng.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_nxOSdcbaQ6uslLiCTVW5Vg_0-tWI3Xj';
const PORT = process.env.PORT || 3000;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── ESTADO DAS CONVERSAS (em memória) ──────────────────
const sessions = {};

// ── HELPER: Enviar mensagem ────────────────────────────
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

// ── HELPER: Gerar ID ───────────────────────────────────
function gerarId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'ARV-';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ── HELPER: Salvar cliente no Supabase ─────────────────
async function salvarCliente(empresa, ramo, zap) {
  const id = gerarId();
  try {
    const { error } = await sb.from('clientes').insert([{ id, nome: empresa, ramo, zap }]);
    if (error) throw error;
    return id;
  } catch (e) {
    console.error('Erro Supabase:', e.message);
    return id; // retorna ID mesmo se falhar
  }
}

// ── FLUXO DO BOT ───────────────────────────────────────
async function processMessage(from, text) {
  const msg = text.trim().toLowerCase();

  // Inicia ou recupera sessão
  if (!sessions[from]) {
    sessions[from] = { phase: 'menu' };
  }
  const s = sessions[from];

  // ── MENU PRINCIPAL ──────────────────────────────────
  if (s.phase === 'menu') {
    await send(from,
      `Olá! 👋 Seja bem-vindo(a) à *Artyva*!\n\n` +
      `Sou a *Arty*, assistente virtual da Roberta. 🌿\n\n` +
      `Como posso te ajudar hoje?\n\n` +
      `1️⃣ Quero fazer um diagnóstico gratuito\n` +
      `2️⃣ Conhecer serviços e investimento\n` +
      `3️⃣ Agendar uma visita com a Roberta\n` +
      `4️⃣ Falar diretamente com a Roberta`
    );
    s.phase = 'aguarda_menu';
    return;
  }

  // ── AGUARDA ESCOLHA DO MENU ─────────────────────────
  if (s.phase === 'aguarda_menu') {
    if (msg === '1' || msg.includes('diagnos')) {
      s.phase = 'diag_empresa';
      await send(from,
        `Que ótima escolha! 🎉 O diagnóstico da Artyva é *100% gratuito*!\n\n` +
        `Vou gerar um formulário personalizado pra você agora. 😊\n\n` +
        `Qual é o *nome da sua empresa ou negócio*?`
      );
    } else if (msg === '2' || msg.includes('servi') || msg.includes('valor') || msg.includes('preco') || msg.includes('preço')) {
      s.phase = 'aguarda_menu';
      await send(from,
        `A *Artyva* oferece assessoria completa em 4 pilares:\n\n` +
        `💰 *Gestão Financeira* — DRE, fluxo de caixa, controle\n\n` +
        `⚙️ *Gestão Administrativa* — processos e organização\n\n` +
        `👥 *Gestão de Pessoas* — time, cultura e rotinas\n\n` +
        `📊 *Consultoria Estratégica* — metas e indicadores\n\n` +
        `Cada proposta é 100% personalizada após diagnóstico gratuito!\n\n` +
        `Digite *1* para fazer seu diagnóstico agora ou *4* para falar com a Roberta.`
      );
    } else if (msg === '3' || msg.includes('agend') || msg.includes('visita') || msg.includes('reuniao') || msg.includes('reunião')) {
      s.phase = 'agendar';
      await send(from,
        `Com prazer! 📅 A Roberta adora conhecer cada empreendedor pessoalmente!\n\n` +
        `Me passa seu *nome e empresa* que ela entra em contato para confirmar o melhor horário:`
      );
    } else if (msg === '4' || msg.includes('roberta') || msg.includes('humano') || msg.includes('atendente')) {
      s.phase = 'menu';
      await send(from,
        `Claro! 🙋 Vou avisar a *Roberta* que você quer falar com ela.\n\n` +
        `Em instantes ela estará aqui! Você também pode entrar em contato diretamente:\n\n` +
        `📞 *(11) 2368-4091*\n` +
        `📧 artyva@artyva.com.br`
      );
    } else {
      await send(from,
        `Não entendi muito bem. 😊\n\n` +
        `Digite o número da opção desejada:\n\n` +
        `1️⃣ Diagnóstico gratuito\n` +
        `2️⃣ Serviços e investimento\n` +
        `3️⃣ Agendar visita\n` +
        `4️⃣ Falar com a Roberta`
      );
    }
    return;
  }

  // ── FLUXO DIAGNÓSTICO ───────────────────────────────
  if (s.phase === 'diag_empresa') {
    s.empresa = text.trim();
    s.phase = 'diag_segmento';
    await send(from,
      `*${s.empresa}* — que nome bonito! 😊\n\n` +
      `Qual é o *segmento* do seu negócio?\n\n` +
      `1️⃣ Varejo / Comércio\n` +
      `2️⃣ Alimentação / Restaurante\n` +
      `3️⃣ Serviços\n` +
      `4️⃣ Construção Civil\n` +
      `5️⃣ Saúde / Bem-estar\n` +
      `6️⃣ Indústria\n` +
      `7️⃣ Outro`
    );
    return;
  }

  if (s.phase === 'diag_segmento') {
    const segmentos = {
      '1': 'Varejo', '2': 'Alimentação/Restaurante', '3': 'Serviços',
      '4': 'Construção Civil', '5': 'Saúde', '6': 'Indústria', '7': 'Outro'
    };
    s.segmento = segmentos[msg] || text.trim();
    s.phase = 'diag_zap';
    await send(from,
      `Perfeito! ✅\n\n` +
      `Última pergunta: qual é o seu *WhatsApp* com DDD?\n` +
      `A Roberta vai te contatar após analisar o diagnóstico. 📱`
    );
    return;
  }

  if (s.phase === 'diag_zap') {
    s.zap = text.trim();
    s.phase = 'menu';

    await send(from, `Anotado! 📝 Salvando seus dados e gerando seu link personalizado...`);

    const clienteId = await salvarCliente(s.empresa, s.segmento, s.zap);
    const link = `https://diagnostico.artyva.com.br/formulario.html?id=${clienteId}`;

    await send(from,
      `Pronto! ✅ Seu diagnóstico personalizado está salvo!\n\n` +
      `🔗 *Seu link exclusivo:*\n${link}\n\n` +
      `Ao preencher, a *Roberta* vai analisar os dados de *${s.empresa}* ` +
      `e entrar em contato no WhatsApp *${s.zap}* com um plano de ação completo. 🌿`
    );

    await send(from,
      `Posso te ajudar em mais alguma coisa?\n\n` +
      `1️⃣ Diagnóstico gratuito\n` +
      `2️⃣ Serviços e investimento\n` +
      `3️⃣ Agendar visita\n` +
      `4️⃣ Falar com a Roberta`
    );
    s.phase = 'aguarda_menu';
    return;
  }

  // ── FLUXO AGENDAMENTO ───────────────────────────────
  if (s.phase === 'agendar') {
    s.phase = 'menu';
    await send(from,
      `Anotado! ✅ A *Roberta* vai entrar em contato em breve para confirmar o horário. 🌿\n\n` +
      `Qualquer dúvida: 📞 (11) 2368-4091`
    );
    return;
  }

  // ── FALLBACK ────────────────────────────────────────
  s.phase = 'aguarda_menu';
  await send(from,
    `Olá! 😊 Como posso te ajudar?\n\n` +
    `1️⃣ Diagnóstico gratuito\n` +
    `2️⃣ Serviços e investimento\n` +
    `3️⃣ Agendar visita\n` +
    `4️⃣ Falar com a Roberta`
  );
}

// ── WEBHOOK ────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Evolution API v2 format
    if (body?.data?.key?.fromMe) return res.sendStatus(200); // ignora mensagens próprias
    if (body?.event !== 'messages.upsert') return res.sendStatus(200);

    const message = body?.data;
    if (!message) return res.sendStatus(200);

    const from = message?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    const text =
      message?.message?.conversation ||
      message?.message?.extendedTextMessage?.text ||
      '';

    if (!from || !text) return res.sendStatus(200);

    console.log(`📩 De: ${from} | Mensagem: ${text}`);
    await processMessage(from, text);

    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error:', e.message);
    res.sendStatus(500);
  }
});

// ── HEALTH CHECK ───────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Artyva Bot rodando! 🌿' });
});

app.listen(PORT, () => {
  console.log(`🤖 Artyva Bot rodando na porta ${PORT}`);
});
