const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution-api-production-384c.up.railway.app';
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || '27057fa8106ef94d0f85bc25dceccba9b3cac1fc09906ee3f8f47092e175eeb2';
const INSTANCE = process.env.INSTANCE_NAME || 'artyva';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bxqqygsuxvmdtjugesng.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_nxOSdcbaQ6uslLiCTVW5Vg_0-tWI3Xj';
const PORT = process.env.PORT || 8080;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const sessions = {};

async function send(to, text) {
  try {
    await axios.post(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`,
      { number: to, text },
      { headers: { apikey: EVOLUTION_KEY } }
    );
  } catch (e) { console.error('Erro ao enviar:', e.message); }
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
  } catch (e) { console.error('Erro Supabase:', e.message); }
  return id;
}

async function processMessage(from, text) {
  const msg = text.trim().toLowerCase();
  if (!sessions[from]) sessions[from] = { phase: 'menu' };
  const s = sessions[from];

  if (s.phase === 'menu') {
    await send(from, `Olá! 👋 Seja bem-vindo(a) à *Artyva*!\n\nSou a *Arty*, assistente virtual da Roberta. 🌿\n\nComo posso te ajudar hoje?\n\n1️⃣ Quero fazer um diagnóstico gratuito\n2️⃣ Conhecer serviços e investimento\n3️⃣ Agendar uma visita com a Roberta\n4️⃣ Falar diretamente com a Roberta`);
    s.phase = 'aguarda_menu';
    return;
  }

  if (s.phase === 'aguarda_menu') {
    if (msg === '1' || msg.includes('diagnos')) {
      s.phase = 'diag_empresa';
      await send(from, `Que ótima escolha! 🎉 O diagnóstico da Artyva é *100% gratuito*!\n\nVou gerar um formulário personalizado pra você agora. 😊\n\nQual é o *nome da sua empresa ou negócio*?`);
    } else if (msg === '2' || msg.includes('servi')) {
      await send(from, `A *Artyva* oferece assessoria completa em 4 pilares:\n\n💰 *Gestão Financeira* — DRE, fluxo de caixa\n\n⚙️ *Gestão Administrativa* — processos e organização\n\n👥 *Gestão de Pessoas* — time e cultura\n\n📊 *Consultoria Estratégica* — metas e indicadores\n\nDigite *1* para diagnóstico gratuito ou *4* para falar com a Roberta.`);
    } else if (msg === '3' || msg.includes('agend')) {
      s.phase = 'agendar';
      await send(from, `Com prazer! 📅 A Roberta adora conhecer cada empreendedor pessoalmente!\n\nMe passa seu *nome e empresa* que ela entra em contato:`);
    } else if (msg === '4' || msg.includes('roberta')) {
      s.phase = 'menu';
      await send(from, `Claro! 🙋 Vou avisar a *Roberta* que você quer falar com ela.\n\n📞 *(11) 2368-4091*\n📧 artyva@artyva.com.br`);
    } else {
      await send(from, `Não entendi. 😊 Digite o número:\n\n1️⃣ Diagnóstico gratuito\n2️⃣ Serviços\n3️⃣ Agendar visita\n4️⃣ Falar com a Roberta`);
    }
    return;
  }

  if (s.phase === 'diag_empresa') {
    s.empresa = text.trim();
    s.phase = 'diag_segmento';
    await send(from, `*${s.empresa}* — ótimo! 😊\n\nQual o *segmento*?\n\n1️⃣ Varejo\n2️⃣ Alimentação\n3️⃣ Serviços\n4️⃣ Construção Civil\n5️⃣ Saúde\n6️⃣ Indústria\n7️⃣ Outro`);
    return;
  }

  if (s.phase === 'diag_segmento') {
    const segs = {'1':'Varejo','2':'Alimentação','3':'Serviços','4':'Construção Civil','5':'Saúde','6':'Indústria','7':'Outro'};
    s.segmento = segs[msg] || text.trim();
    s.phase = 'diag_zap';
    await send(from, `Perfeito! ✅\n\nÚltima pergunta: qual o seu *WhatsApp* com DDD?`);
    return;
  }

  if (s.phase === 'diag_zap') {
    s.zap = text.trim();
    s.phase = 'aguarda_menu';
    await send(from, `Anotado! 📝 Gerando seu link personalizado...`);
    const id = await salvarCliente(s.empresa, s.segmento, s.zap);
    await send(from, `Pronto! ✅\n\n🔗 *Seu diagnóstico exclusivo:*\nhttps://diagnostico.artyva.com.br/formulario.html?id=${id}\n\nA *Roberta* vai analisar os dados de *${s.empresa}* e entrar em contato! 🌿`);
    await send(from, `Posso ajudar em mais algo?\n\n1️⃣ Diagnóstico\n2️⃣ Serviços\n3️⃣ Agendar\n4️⃣ Falar com Roberta`);
    return;
  }

  if (s.phase === 'agendar') {
    s.phase = 'aguarda_menu';
    await send(from, `Anotado! ✅ A *Roberta* vai entrar em contato em breve. 🌿\n\n📞 (11) 2368-4091`);
    return;
  }

  s.phase = 'aguarda_menu';
  await send(from, `Olá! 😊\n\n1️⃣ Diagnóstico\n2️⃣ Serviços\n3️⃣ Agendar\n4️⃣ Falar com Roberta`);
}

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    console.log('📨 Webhook:', JSON.stringify(body));

    let from = null;
    let text = null;

    if (body && body.inputs && body.inputs.query !== undefined) {
      if (body.fromMe) return res.sendStatus(200);
      from = (body.remoteJid || body.user || '').replace('@s.whatsapp.net', '').replace('@g.us', '');
      text = body.inputs.query;
    } else if (body && body.session && body.remoteJid) {
      if (body.fromMe) return res.sendStatus(200);
      from = body.remoteJid.replace('@s.whatsapp.net', '');
      text = body.text || (body.inputs && body.inputs.query) || '';
    } else if (body && body.data && body.data.key) {
      if (body.data.key.fromMe) return res.sendStatus(200);
      from = body.data.key.remoteJid && body.data.key.remoteJid.replace('@s.whatsapp.net', '');
      text = (body.data.message && body.data.message.conversation) || '';
    } else if (body && body.key) {
      if (body.key.fromMe) return res.sendStatus(200);
      from = body.key.remoteJid && body.key.remoteJid.replace('@s.whatsapp.net', '');
      text = (body.message && body.message.conversation) || '';
    }

    if (!from || !text) {
      console.log('⚠️ Ignorado:', JSON.stringify({from, text}));
      return res.sendStatus(200);
    }

    console.log(`📩 ${from}: ${text}`);
    await processMessage(from, text);
    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error:', e.message);
    res.sendStatus(500);
  }
});
