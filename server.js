const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PIPEDRIVE_KEY = process.env.PIPEDRIVE_API_KEY;

app.use(express.static(path.join(__dirname, 'public')));

// ─── HELPERS ────────────────────────────────────────────────────────────────
function getPeriodDates(mode) {
  const now = new Date();
  let start;
  if (mode === 'week') {
    start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
  } else if (mode === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else { // 30days
    start = new Date(now);
    start.setDate(now.getDate() - 30);
  }
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function pipedriveGet(path) {
  const url = `https://api.pipedrive.com/v1${path}${path.includes('?') ? '&' : '?'}api_token=${PIPEDRIVE_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pipedrive error ${res.status}: ${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Pipedrive API error');
  return json.data || [];
}

async function fetchAllActivities() {
  let all = [], start = 0;
  while (true) {
    const [done, open] = await Promise.all([
      pipedriveGet(`/activities?done=1&limit=500&start=${start}`),
      pipedriveGet(`/activities?done=0&limit=500&start=${start}`),
    ]);
    all = [...all, ...(done || []), ...(open || [])];
    if ((done || []).length < 500 && (open || []).length < 500) break;
    start += 500;
    if (start > 15000) break;
  }
  return all;
}

// ─── TYPE CLASSIFICATION ─────────────────────────────────────────────────────
const TYPE_RULES = [
  { prefix: 'reuniao_realizada',        group: 'realizada',     label: 'Reunião realizada',       countsMeta: true  },
  { prefix: 'sdr_venda_feita',          group: 'venda',         label: 'Venda pelo SDR',          countsMeta: true  },
  { prefix: 'ligacao_de_prospeccaonao', group: 'ligacao',       label: 'Ligação não atendida',    countsMeta: false },
  { prefix: 'ligacao_de_prospeccao',    group: 'ligacao',       label: 'Ligação de prospecção',   countsMeta: false },
  { prefix: 'ligacao_atendida',         group: 'ligacao',       label: 'Ligação atendida',        countsMeta: false },
  { prefix: 'ligacao_de_fechamento',    group: 'fechamento',    label: 'Follow-up fechamento',    countsMeta: false },
  { prefix: 'ligacao_atendidar',        group: 'ligacao',       label: 'Ligação — retornar',      countsMeta: false },
  { prefix: 'ccl___ligacao',            group: 'ligacao_ccl',   label: 'Ligação CCL',             countsMeta: false },
  { prefix: '1o_tentativa_de_whatsapp', group: 'whatsapp',      label: '1ª Tentativa WhatsApp',   countsMeta: false },
  { prefix: '2o_tentativa_de_whatsapp', group: 'whatsapp',      label: '2ª Tentativa WhatsApp',   countsMeta: false },
  { prefix: '3o_tentativa_de_whatsapp', group: 'whatsapp',      label: '3ª Tentativa WhatsApp',   countsMeta: false },
  { prefix: '4o_tentativa_de_whatsapp', group: 'whatsapp',      label: '4ª Tentativa WhatsApp',   countsMeta: false },
  { prefix: '5o_tentativa_de_whatsapp', group: 'whatsapp',      label: '5ª Tentativa WhatsApp',   countsMeta: false },
  { prefix: 'confirmacao_de_presenca',  group: 'confirmacao',   label: 'Confirmação de presença', countsMeta: false },
  { prefix: '1o_confirmacao',           group: 'confirmacao',   label: '1ª Confirmação',          countsMeta: false },
  { prefix: '2o_confirmacao',           group: 'confirmacao',   label: '2ª Confirmação',          countsMeta: false },
  { prefix: '3o_confirmacao',           group: 'confirmacao',   label: '3ª Confirmação',          countsMeta: false },
  { prefix: 'mensagem_de_30_min',       group: 'confirmacao',   label: 'WhatsApp 30min antes',    countsMeta: false },
  { prefix: 'mensagem_apos_no_show',    group: 'noshow',        label: 'Mensagem pós no-show',    countsMeta: false },
  { prefix: 'no_show',                  group: 'noshow',        label: 'No show',                 countsMeta: false },
  { prefix: 'auto_agendamento',         group: 'autoagend',     label: 'Auto agendamento',        countsMeta: false },
  { prefix: 'auto_agenadmento',         group: 'autoagend',     label: 'Auto agend.',             countsMeta: false },
  { prefix: 'reagendamento',            group: 'reagendamento', label: 'Reagendamento',           countsMeta: false },
  { prefix: 'sdr_lead_cancelou',        group: 'cancelamento',  label: 'Lead cancelou',           countsMeta: false },
  { prefix: 'sdr_oportunidade',         group: 'oportunidade',  label: 'Oportunidade cash',       countsMeta: false },
  { prefix: 'closer_fupreativacao',     group: 'reativacao',    label: 'Reativação de base',      countsMeta: false },
  { prefix: 'depoimento',               group: 'fechamento',    label: 'Depoimento',              countsMeta: false },
  { prefix: 'coleta_de_dados',          group: 'pos_venda',     label: 'Coleta pós-venda',        countsMeta: false },
  { prefix: 'call',                     group: 'ligacao',       label: 'Ligação',                 countsMeta: false },
];

function norm(s) { return (s || '').toLowerCase().trim().replace(/\s+/g, ' '); }
function classifyType(type) {
  const t = norm(type);
  for (const r of TYPE_RULES) { if (t.startsWith(r.prefix)) return r; }
  return null;
}

const SDR_NAMES = new Set([
  'Edrius Vieira', 'Fernanda Piemonte', 'João Madeira', 'Kauai Moro',
  'Kevin Amaro de Sousa', 'Lais', 'Luiz Roos', 'Nátali Helena', 'Samuel', 'Thiago Palivoda'
]);

// ─── API ENDPOINT ─────────────────────────────────────────────────────────────
app.get('/api/dashboard', async (req, res) => {
  try {
    const mode = req.query.period || 'month';
    const { start, end } = getPeriodDates(mode);

    // Busca usuários e atividades em paralelo
    const [users, allActs] = await Promise.all([
      pipedriveGet('/users?limit=100'),
      fetchAllActivities(),
    ]);

    // Mapa id → nome
    const idToName = {};
    (users || []).forEach(u => { idToName[u.id] = u.name; });

    // Filtra por período
    const acts = allActs.filter(a => {
      const raw = a.due_date || a.add_time || '';
      if (!raw) return false;
      const dt = new Date(raw.length === 10 ? raw + 'T12:00:00' : raw);
      return dt >= start && dt <= end;
    });

    // Agrupa por nome
    const uMap = {};
    const globalGroup = {};

    acts.forEach(a => {
      const createdById = typeof a.created_by_user_id === 'object' ? a.created_by_user_id?.id : a.created_by_user_id;
      const userId = typeof a.user_id === 'object' ? a.user_id?.id : a.user_id;
      const name = idToName[createdById] || idToName[userId] || null;
      if (!name) return;

      if (!uMap[name]) uMap[name] = {
        name,
        byGroup: {}, realizadas: 0, ligacoes: 0,
        whatsapp: 0, noshow: 0, vendas: 0, total: 0
      };

      const u = uMap[name];
      const info = classifyType(a.type);
      u.total++;
      if (!info) return;

      const g = info.group;
      u.byGroup[g] = (u.byGroup[g] || 0) + 1;
      globalGroup[g] = (globalGroup[g] || 0) + 1;
      if (info.countsMeta) u.realizadas++;
      if (g === 'ligacao' || g === 'ligacao_ccl') u.ligacoes++;
      if (g === 'whatsapp') u.whatsapp++;
      if (g === 'noshow') u.noshow++;
      if (g === 'venda') u.vendas++;
    });

    // Filtra apenas SDRs do time
    let sdrs = Object.values(uMap)
      .filter(s => SDR_NAMES.has(s.name) && s.total > 0)
      .sort((a, b) => b.realizadas - a.realizadas);

    // Fallback: mostra todos se nenhum SDR aparecer
    if (sdrs.length === 0) {
      sdrs = Object.values(uMap)
        .filter(s => s.total > 0)
        .sort((a, b) => b.realizadas - a.realizadas);
    }

    const META_GOAL = 80;
    const totR = sdrs.reduce((s, u) => s + u.realizadas, 0);
    const totL = sdrs.reduce((s, u) => s + u.ligacoes, 0);
    const totW = sdrs.reduce((s, u) => s + u.whatsapp, 0);
    const totN = sdrs.reduce((s, u) => s + u.noshow, 0);
    const totV = sdrs.reduce((s, u) => s + u.vendas, 0);
    const metaTotal = sdrs.length * META_GOAL;
    const pctTime = metaTotal > 0 ? Math.round((totR / metaTotal) * 100) : 0;

    const pLabels = { month: 'Este mês', week: 'Esta semana', '30days': 'Últimos 30 dias' };
    const updatedAt = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    res.json({
      period: pLabels[mode] || mode,
      updated_at: updatedAt,
      total_activities: acts.length,
      summary: {
        realizadas: totR,
        ligacoes: totL,
        whatsapp: totW,
        noshow: totN,
        vendas: totV,
        pct_meta: pctTime,
        meta_total: metaTotal,
        sdrs_acima: sdrs.filter(s => s.realizadas >= META_GOAL).length,
        sdrs_faixa: sdrs.filter(s => s.realizadas >= 60 && s.realizadas < META_GOAL).length,
        sdrs_abaixo: sdrs.filter(s => s.realizadas < 60).length,
      },
      sdrs: sdrs.map((s, i) => ({
        position: i + 1,
        name: s.name,
        realizadas: s.realizadas,
        pct_meta: Math.round((s.realizadas / META_GOAL) * 100),
        ligacoes: s.ligacoes,
        whatsapp: s.whatsapp,
        noshow: s.noshow,
        vendas: s.vendas,
        total: s.total,
        byGroup: s.byGroup,
      })),
      globalGroup,
      funil: {
        ligacoes: globalGroup['ligacao'] || 0,
        whatsapp: globalGroup['whatsapp'] || 0,
        confirmacoes: globalGroup['confirmacao'] || 0,
        autoagend: globalGroup['autoagend'] || 0,
        realizadas: globalGroup['realizada'] || 0,
        reagendamentos: globalGroup['reagendamento'] || 0,
        noshow: globalGroup['noshow'] || 0,
        cancelamentos: globalGroup['cancelamento'] || 0,
        vendas: globalGroup['venda'] || 0,
        fechamento: globalGroup['fechamento'] || 0,
      },
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Dashboard Podium rodando na porta ${PORT}`);
});
