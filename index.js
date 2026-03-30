const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// ── CONFIGURAÇÕES ──────────────────────────────────────
const EVOLUTION_URL  = process.env.EVOLUTION_URL  || 'https://evolution-api-production-384c.up.railway.app';
const EVOLUTION_KEY  = process.env.EVOLUTION_KEY  || '27057fa8106ef94d0f85bc25dceccba9b3cac1fc09906ee3f8f47092e175eeb2';
const INSTANCE       = process.env.INSTANCE_NAME  || 'Artyva';
const SUPABASE_URL   = process.env.SUPABASE_URL   || 'https://bxqqygsuxvmdtjugesng.supabase.co';
const SUPABASE_KEY   = process.env.SUPABASE_KEY   || 'sb_publishable_nxOSdcbaQ6uslLiCTVW5Vg_0-tWI3Xj';
const PORT           = process.env.PORT            || 8080;

// Número da Roberta — sem @s.whatsapp.net, sem +, só dígitos com DDI
const NUMERO_ROBERTA = '551123684091';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const DIAS_ATENDIMENTO = [1, 2, 3, 4, 5]; // seg a sex
const HORA_INICIO      = 9;
const HORA_FIM         = 18;
const TEMPO_PAUSA_MS   = 3 * 60 * 60 * 1000; // 3 horas em ms

// ── HELPERS DE TEMPO ───────────────────────────────────
function dentroDoHorario() {
  const agora    = new Date();
  const brasilia = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return DIAS_ATENDIMENTO.includes(brasilia.getDay()) &&
    brasilia.getHours() >= HORA_INICIO &&
    brasilia.getHours() < HORA_FIM;
}

// ── MENUS ──────────────────────────────────────────────
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

// ── ENVIO DE MENSAGEM ──────────────────────────────────
async function send(to, text) {
  try {
    await axios.post(
      `${EVOLUTION_URL}/message/sendText/${INSTANCE}`,
      { number: to, text },
      { headers: { apikey: EVOLUTION_KEY } }
    );
  } catch (e) {
    console.error('[SEND ERROR]', e.message);
  }
}

// ── GERADOR DE ID DO CLIENTE ───────────────────────────
function gerarId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'ARV-';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ── SUPABASE: SALVAR CLIENTE LEAD ──────────────────────
async function salvarCliente(empresa, ramo, zap) {
  const id = gerarId();
  try {
    await sb.from('clientes').insert([{ id, nome: empresa, ramo, zap }]);
  } catch (e) {
    console.error('[SUPABASE INSERT ERROR]', e.message);
  }
  return id;
}

// ── SUPABASE: SESSÃO ───────────────────────────────────
// Tabela necessária no Supabase:
// CREATE TABLE bot_sessions (
//   zap text PRIMARY KEY,
//   phase text DEFAULT 'menu',
//   data jsonb DEFAULT '{}'::jsonb,
//   pausado boolean DEFAULT false,
//   pausa_inicio timestamptz,
//   ultima_interacao timestamptz,
//   updated_at timestamptz DEFAULT now()
// );

async function getSession(zap) {
  try {
    const { data, error } = await sb
      .from('bot_sessions')
      .select('*')
      .eq('zap', zap)
      .single();

    if (error || !data) {
      // Sessão nova — cria no banco
      const nova = { zap, phase: 'menu', data: {}, pausado: false, pausa_inicio: null, ultima_interacao: null };
      await sb.from('bot_sessions').insert([nova]);
      return nova;
    }
    return data;
  } catch (e) {
    console.error('[GET SESSION ERROR]', e.message);
    return { zap, phase: 'menu', data: {}, pausado: false, pausa_inicio: null, ultima_interacao: null };
  }
}

async function saveSession(zap, updates) {
  try {
    await sb.from('bot_sessions')
      .upsert({ zap, ...updates, updated_at: new Date().toISOString() });
  } catch (e) {
    console.error('[SAVE SESSION ERROR]', e.message);
  }
}

// ── LÓGICA PRINCIPAL ───────────────────────────────────
async function processMessage(from, text) {
  const msg = text.trim().toLowerCase();
  const sess = await getSession(from);

  // ── 1. VERIFICA SE ESTÁ PAUSADO ──────────────────────
  if (sess.pausado) {
    const pausaInicio = sess.pausa_inicio ? new Date(sess.pausa_inicio).getTime() : 0;
    const tempoPassado = Date.now() - pausaInicio;

    if (tempoPassado > TEMPO_PAUSA_MS) {
      // Pausa expirou — reativa automaticamente
      console.log(`[REATIVADO AUTO] ${from} — pausa expirada`);
      await saveSession(from, {
        pausado: false,
        pausa_inicio: null,
        phase: 'aguarda_menu',
        data: {},
        ultima_interacao: new Date().toISOString()
      });
      await send(from,
        'Que bom ter voc\u00ea de volta! \ud83e\udd70 A Roberta vai ficar muito feliz em saber!\n\n' +
        'Como posso te ajudar hoje?\n\n' +
        menuOpcoes()
      );
    } else {
      const restante = Math.round((TEMPO_PAUSA_MS - tempoPassado) / 60000);
      console.log(`[PAUSADO] ${from} | Restante: ${restante} min`);
      // Bot silencioso — não responde durante a pausa
    }
    return;
  }

  // ── 2. VOLTAR AO MENU ─────────────────────────────────
  if (msg === '0' || msg === 'menu') {
    await saveSession(from, { phase: 'aguarda_menu', data: {}, ultima_interacao: new Date().toISOString() });
    await send(from, 'Voltando ao menu! \ud83d\ude0a\n\n' + menuOpcoes());
    return;
  }

  // ── 3. CLIENTE RECORRENTE (voltou após 3h+ sem pausa) ─
  const ultimaInt = sess.ultima_interacao ? new Date(sess.ultima_interacao).getTime() : null;
  const eRecorrente = ultimaInt && (Date.now() - ultimaInt) > TEMPO_PAUSA_MS;

  await saveSession(from, { ultima_interacao: new Date().toISOString() });

  if (eRecorrente && sess.phase !== 'menu') {
    await saveSession(from, { phase: 'aguarda_menu', data: {} });
    await send(from,
      'Que bom ter voc\u00ea de volta! \ud83e\udd70 A Roberta vai ficar muito feliz em saber!\n\n' +
      'Como posso te ajudar hoje?\n\n' +
      menuOpcoes()
    );
    return;
  }

  // ── 4. SAUDAÇÕES ──────────────────────────────────────
  const saudacoes = ['oi', 'ola', 'ol\u00e1', 'oii', 'boa tarde', 'bom dia', 'boa noite', 'inicio', 'in\u00edcio'];
  if (saudacoes.includes(msg) && sess.phase !== 'menu') {
    await saveSession(from, { phase: 'aguarda_menu', data: {} });
    await send(from, 'Ol\u00e1 de novo! \ud83d\ude0a\n\nComo posso te ajudar?\n\n' + menuOpcoes());
    return;
  }

  // ── 5. MENU INICIAL ───────────────────────────────────
  if (sess.phase === 'menu') {
    await saveSession(from, { phase: 'aguarda_menu' });
    await send(from,
      'Ol\u00e1! \ud83d\udc4b Seja bem-vindo(a) \u00e0 *Artyva*!\n\n' +
      'Sou a *Arty*, assistente virtual da Roberta. \ud83c\udf3f\n\n' +
      'Como posso te ajudar hoje?\n\n' +
      menuOpcoes()
    );
    return;
  }

  // ── 6. AGUARDA ESCOLHA DO MENU ────────────────────────
  if (sess.phase === 'aguarda_menu') {

    if (msg === '1' || msg.includes('diagnos')) {
      await saveSession(from, { phase: 'diag_empresa' });
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
      await saveSession(from, { phase: 'agendar' });
      await send(from,
        'Com prazer! \ud83d\udcc5 A Roberta adora conhecer cada empreendedor pessoalmente!\n\n' +
        'Me passa seu *nome e empresa* que ela entra em contato:\n\n' +
        '_Digite *0* para voltar ao menu_'
      );

    } else if (msg === '4' || msg.includes('roberta') || msg.includes('humano') || msg.includes('atendente')) {
      // Cliente pediu Roberta — pausa bot e notifica
      await saveSession(from, {
        pausado: true,
        pausa_inicio: new Date().toISOString(),
        phase: 'menu'
      });

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
        // Fora do horário: não pausa, mantém bot ativo
        await saveSession(from, { pausado: false, pausa_inicio: null, phase: 'aguarda_menu' });
      }

    } else {
      await send(from, 'N\u00e3o entendi. \ud83d\ude0a Digite o n\u00famero:\n\n' + menuOpcoes());
    }
    return;
  }

  // ── 7. FLUXO DE DIAGNÓSTICO ───────────────────────────
  if (sess.phase === 'diag_empresa') {
    const novaData = { ...sess.data, empresa: text.trim() };
    await saveSession(from, { phase: 'diag_segmento', data: novaData });
    await send(from,
      `*${text.trim()}* \u2014 que nome bonito! \ud83d\ude0a\n\n` +
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

  if (sess.phase === 'diag_segmento') {
    const segs = {
      '1': 'Varejo', '2': 'Alimenta\u00e7\u00e3o', '3': 'Servi\u00e7os',
      '4': 'Constru\u00e7\u00e3o Civil', '5': 'Sa\u00fade', '6': 'Ind\u00fastria', '7': 'Outro'
    };
    const segmento = segs[msg] || text.trim();
    const novaData = { ...sess.data, segmento };
    await saveSession(from, { phase: 'diag_zap', data: novaData });
    await send(from,
      'Perfeito! \u2705\n\n' +
      '\u00daltima pergunta: qual \u00e9 o seu *WhatsApp* com DDD?\n' +
      'A Roberta vai te contatar ap\u00f3s analisar o diagn\u00f3stico. \ud83d\udcf1\n\n' +
      '_Digite *0* para voltar ao menu_'
    );
    return;
  }

  if (sess.phase === 'diag_zap') {
    const novaData = { ...sess.data, zap: text.trim() };
    await saveSession(from, { phase: 'aguarda_menu', data: {} });
    await send(from, 'Anotado! \ud83d\udcdd Salvando seus dados e gerando seu link...');
    const id = await salvarCliente(novaData.empresa, novaData.segmento, novaData.zap);
    await send(from,
      'Pronto! \u2705 Seu diagn\u00f3stico personalizado est\u00e1 salvo!\n\n' +
      '\ud83d\udd17 *Seu link exclusivo:*\n' +
      `https://diagnostico.artyva.com.br/formulario.html?id=${id}\n\n` +
      `Ao preencher, a *Roberta* vai analisar os dados de *${novaData.empresa}* e entrar em contato no WhatsApp *${novaData.zap}*! \ud83c\udf3f`
    );
    await send(from, 'Posso te ajudar em mais alguma coisa? \ud83d\ude0a\n\n' + menuResumido());
    return;
  }

  // ── 8. AGENDAMENTO ────────────────────────────────────
  if (sess.phase === 'agendar') {
    await saveSession(from, { phase: 'aguarda_menu', data: {} });
    await send(from,
      'Anotado! \u2705 A *Roberta* vai entrar em contato em breve. \ud83c\udf3f\n\n' +
      '\ud83d\udcde (11) 2368-4091\n\n' +
      menuResumido()
    );
    return;
  }

  // ── 9. FALLBACK ───────────────────────────────────────
  await saveSession(from, { phase: 'aguarda_menu' });
  await send(from, 'Ol\u00e1! \ud83d\ude0a\n\n' + menuOpcoes());
}

// ── WEBHOOK ────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Responde imediatamente pro Evolution não dar timeout

  try {
    const body = req.body;
    console.log('[RAW]', JSON.stringify(body).substring(0, 400));

    if (!body || !body.inputs) {
      console.log('[IGNORADO] body sem inputs');
      return;
    }

    const inp = body.inputs;

    // ── Extrai dados do payload ──
    const remoteJid = String(inp.remoteJid || inp.user || '').trim();
    const fromMe    = inp.fromMe === true || inp.fromMe === 'true';
    const text      = String(body.query || inp.query || inp.text || '').trim();

    // Ignora grupos
    if (remoteJid.includes('@g.us')) {
      console.log('[GRUPO] ignorado');
      return;
    }

    // Normaliza número — remove sufixo whatsapp e espaços
    const from = remoteJid.replace('@s.whatsapp.net', '').replace(/\s/g, '').trim();

    if (!from || !text) {
      console.log('[IGNORADO] from ou text vazio | from:', from, '| text:', text);
      return;
    }

    const msg = text.trim().toLowerCase();

    // ── COMANDO #bot — ROBERTA REATIVA O ATENDIMENTO ──
    // Roberta digita #bot na conversa do CLIENTE (fromMe=true)
    // O "from" aqui é o número do cliente porque o webhook vem da conversa dele
    if (fromMe && msg === '#bot') {
      console.log(`[#BOT] Roberta reativou bot para: ${from}`);
      await saveSession(from, {
        pausado: false,
        pausa_inicio: null,
        phase: 'aguarda_menu',
        data: {}
      });
      // Não envia mensagem pro cliente — só reativa silenciosamente
      return;
    }

    // ── ROBERTA RESPONDEU MANUALMENTE — pausa o bot para aquele cliente ──
    if (fromMe) {
      console.log(`[PAUSADO] Roberta assumiu conversa com: ${from}`);
      await saveSession(from, {
        pausado: true,
        pausa_inicio: new Date().toISOString()
      });
      return;
    }

    // ── MENSAGEM NORMAL DO CLIENTE ──
    console.log(`[MSG] from: ${from} | text: ${text} | horario: ${dentroDoHorario()}`);
    await processMessage(from, text);

  } catch (e) {
    console.error('[WEBHOOK ERROR]', e.message, e.stack);
  }
});

// GET /webhook — Evolution testa a conexão com GET
app.get('/webhook', (req, res) => res.sendStatus(200));

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', bot: 'Artyva Bot', version: '2.0.0' }));

app.listen(PORT, () => console.log(`[ARTYVA BOT v2.0] Porta ${PORT}`));
