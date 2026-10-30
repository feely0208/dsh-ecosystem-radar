/**
 * 深鲸生态雷达 —— 宿主（服务端）半边
 *
 * 为什么要有它：雷达脚本（~/.dsh/skills/dsh-ecosystem-radar/radar.sh）每天产出
 * snapshot.json + 每日增量-YYYY-MM-DD.md，但只有"知道去哪找"的人才会看。
 * 这个插件把它们做成面板：打开侧栏就看到「近 7 天新增 / 行业空位 / 今日报告」。
 *
 * 数据源（只读）：
 *   ${DSH_ECOSYSTEM_RADAR_DIR:-~/深鲸运营/生态雷达}/snapshot.json
 *   …/每日增量-YYYY-MM-DD.md（取最新一份）
 *
 * 出口：
 *   GET  /dsh-ecosystem-radar/api/overview  概览
 *   GET  /dsh-ecosystem-radar/api/new       近 N 天新增（?days=7&limit=30）
 *   GET  /dsh-ecosystem-radar/api/gaps      行业/能力 供给密度（空位榜）
 *   GET  /dsh-ecosystem-radar/api/report    最新每日增量报告（原文）
 *   POST /dsh-ecosystem-radar/api/refresh   跑一次 radar.sh snapshot 刷新快照
 *   GET  /dsh-ecosystem-radar/api/badge     powered-by-dwh 徽章（本地文件，不联网）
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const 包根 = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE = '/dsh-ecosystem-radar';
const 脚本 = join(homedir(), '.dsh', 'skills', 'dsh-ecosystem-radar', 'radar.sh');

export const name = 'ecosystem-radar';
export const inject = ['webServer'];

function 雷达目录() {
  const 自定义 = process.env.DSH_ECOSYSTEM_RADAR_DIR;
  return 自定义 && 自定义.trim() !== '' ? 自定义 : join(homedir(), '深鲸运营', '生态雷达');
}

/* ── 词表（与 radar.sh 的 INDUSTRY / CAPABILITY 保持一致；这里只做本地统计） ── */
const INDUSTRY = [
  ['法律', ['法律', 'legal', 'law firm', 'litigation']],
  ['合同', ['合同', 'contract', 'agreement', 'e-sign', 'esign']],
  ['律师', ['律师', 'lawyer', 'attorney', 'paralegal', 'counsel']],
  ['司法', ['司法', 'judicial', 'court', 'tribunal']],
  ['文书', ['文书', 'legal document', 'brief', 'pleading', 'drafting']],
  ['合规', ['合规', 'compliance', 'regulatory', 'gdpr', 'audit trail']],
  ['财税', ['财税', 'tax', 'accounting', 'bookkeeping', 'invoice']],
  ['医疗', ['医疗', 'medical', 'clinic', 'health', 'patient', 'ehr']],
  ['教育', ['教育', 'education', 'teaching', 'tutor', 'student', 'course']],
  ['招聘', ['招聘', 'recruit', 'hiring', 'resume', 'interview']],
  ['制造', ['制造', 'manufactur', 'factory', 'mold', 'injection']],
  ['供应链', ['供应链', 'supply chain', 'logistics', 'warehouse', 'inventory']],
  ['房产', ['房产', 'real estate', 'property', 'rental', 'listing']],
  ['金融', ['金融', 'finance', 'trading', 'stock', 'banking', 'insurance']],
  ['政务', ['政务', 'government', 'public sector', 'govtech', 'civic']],
  ['档案', ['档案', 'archive', 'record keep', 'document management', 'dms']],
  ['专利', ['专利', 'patent', 'trademark']],
];
const CAPABILITY = [
  ['文档', ['文档', 'document', 'docx', 'pdf', 'markdown']],
  ['表格', ['表格', 'spreadsheet', 'excel', 'xlsx', 'csv']],
  ['PPT', ['ppt', 'slides', 'deck', 'powerpoint', 'presentation']],
  ['图片', ['图片', 'image', 'photo', 'screenshot', 'vision']],
  ['设计', ['设计', 'design', 'figma', 'theme', 'icon', 'ui kit']],
  ['图表', ['图表', 'chart', 'diagram', 'graph', 'visualiz']],
  ['编码', ['编码', 'coding', 'code', 'programming', 'refactor', 'debug']],
  ['知识库', ['知识库', 'knowledge base', 'rag', 'wiki', 'memory']],
  ['搜索', ['搜索', 'search', 'browse', 'crawl', 'scrape']],
  ['翻译', ['翻译', 'translat', 'i18n', 'localiz']],
  ['语音', ['语音', 'voice', 'speech', 'audio', 'tts', 'asr']],
  ['视频', ['视频', 'video', 'movie', 'ffmpeg', 'subtitle']],
  ['数据', ['数据', 'data', 'analytics', 'dashboard', 'sql', 'report']],
  ['自动化', ['自动化', 'automat', 'workflow', 'agent', 'script', 'task']],
  ['协作', ['协作', 'collab', 'team', 'share', 'realtime', 'sync']],
  ['安全', ['安全', 'security', 'encrypt', 'privacy', 'redact', 'sandbox']],
  ['邮件', ['邮件', 'email', 'mail', 'newsletter']],
  ['客服', ['客服', 'customer support', 'helpdesk', 'ticket', 'crm']],
];

/* 我方已有产品的格子（与 radar.sh 的 DEEPWHALE 一致）—— 命中这些词不能当"空位"看。 */
const 我方存量 = new Set(['法律', '律师', '司法', '文书', '合规', '政务', '档案', '合同', '文档', '表格', 'PPT', '语音', '知识库', '安全', '自动化']);

/* ── 数据读取（全部只读、失败不抛） ── */
function 读快照() {
  try {
    const p = join(雷达目录(), 'snapshot.json');
    if (!existsSync(p)) return null;
    const d = JSON.parse(readFileSync(p, 'utf8'));
    return d && Array.isArray(d.plugins) ? d : null;
  } catch {
    return null;
  }
}

function 读最新报告() {
  try {
    const 目录 = 雷达目录();
    if (!existsSync(目录)) return null;
    const 文件 = readdirSync(目录)
      .filter((f) => /^每日增量-\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort();
    if (文件.length === 0) return null;
    const 最新 = 文件[文件.length - 1];
    return { 文件: 最新, 日期: 最新.replace(/^每日增量-|\.md$/g, ''), 文本: readFileSync(join(目录, 最新), 'utf8') };
  } catch {
    return null;
  }
}

function 命中数(词表, 插件们) {
  const 文本 = 插件们.map((p) => ((p.full_name || '') + ' ' + (p.description || '')).toLowerCase());
  return 词表.map(([标签, 同义词]) => {
    const 词 = 同义词.map((s) => s.toLowerCase());
    let n = 0;
    for (const t of 文本) if (词.some((s) => t.includes(s))) n += 1;
    return { 标签, 数: n, 我方有: 我方存量.has(标签) };
  });
}

const 天前 = (n) => {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
};

function 概览(快照) {
  const 插件们 = 快照 ? 快照.plugins : [];
  const 报告 = 读最新报告();
  const 新增 = 插件们.filter((p) => (p.created_at || '') >= 天前(7));
  return {
    ok: true,
    有数据: !!快照,
    采样时间: 快照 ? 快照.taken_at : null,
    插件数: 插件们.length,
    近7天新增: 新增.length,
    star总量: 插件们.reduce((s, p) => s + (Number(p.stars) || 0), 0),
    最新报告日期: 报告 ? 报告.日期 : null,
    数据目录: 雷达目录(),
    脚本存在: existsSync(脚本),
  };
}

/* ── 刷新：跑一次 radar.sh snapshot（会调 GitHub API，通常几十秒） ── */
function 刷新快照() {
  return new Promise((resolve) => {
    if (!existsSync(脚本)) return resolve({ ok: false, 原因: '没找到雷达脚本：' + 脚本 });
    execFile('bash', [脚本, 'snapshot'], { timeout: 180000, maxBuffer: 4 << 20, windowsHide: true },
      (e, stdout, stderr) => {
        const 输出 = String(stdout || '').trim() || String(stderr || '').trim();
        if (e) return resolve({ ok: false, 原因: String(e.message || e).slice(0, 300), 输出: 输出.slice(-500) });
        resolve({ ok: true, 输出: 输出.slice(-500) });
      });
  });
}

/* ── HTTP 出口 ── */
function 回(res, 码, 数据) {
  const 体 = JSON.stringify(数据);
  res.writeHead(码, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(体) });
  res.end(体);
}

function 建处理器() {
  return async function handler(req, res, url) {
    // ⚠️ 2026-10-30 实测：宿主给 webServer handler 的第三个参数并不总是 URL 对象
    //   （取不到 url.pathname 时会退到 req.url，而 req.url 带查询串）——
    //   于是 /api/summary?window=d30 被当成路径，返回「未知路径」。
    //   这里统一自己拼 URL 再解析：路径与查询都从 req.url 来，三条路都能吃。
    const 原始 = (url && url.pathname)
      ? (url.pathname + (url.search || ''))
      : String(req.url || '/');
    let 解析;
    try { 解析 = new URL(原始, 'http://local'); }
    catch { 解析 = new URL('/', 'http://local'); }
    const 全路径 = decodeURIComponent(解析.pathname);
    const 路 = 全路径.replace(ROUTE, '') || '/';
    const 查询 = 解析.searchParams;

    if (路 === '/api/badge' && req.method === 'GET') {
      try {
        const 图 = readFileSync(join(包根, 'assets', 'deepwhale-badge.png'));
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' });
        res.end(图);
      } catch {
        回(res, 404, { ok: false, 原因: '徽章图片缺失' });
      }
      return;
    }

    if (路 === '/api/overview' && req.method === 'GET') {
      return 回(res, 200, 概览(读快照()));
    }

    if (路 === '/api/new' && req.method === 'GET') {
      const 快照 = 读快照();
      if (!快照) return 回(res, 200, { ok: true, 有数据: false, 项: [] });
      const 天数 = Math.min(30, Math.max(1, Number(查询.get('days')) || 7));
      const 上限 = Math.min(100, Math.max(1, Number(查询.get('limit')) || 30));
      const 项 = 快照.plugins
        .filter((p) => (p.created_at || '') >= 天前(天数))
        .sort((a, b) => (Number(b.stars) || 0) - (Number(a.stars) || 0))
        .slice(0, 上限)
        .map((p) => ({
          仓库: p.full_name,
          星: Number(p.stars) || 0,
          说明: p.description || '',
          建于: p.created_at || '',
          URL: 'https://github.com/' + p.full_name,
        }));
      return 回(res, 200, { ok: true, 有数据: true, 天数, 项 });
    }

    if (路 === '/api/gaps' && req.method === 'GET') {
      const 快照 = 读快照();
      if (!快照) return 回(res, 200, { ok: true, 有数据: false, 行业: [], 能力: [] });
      const 排序 = (表) => 表.slice().sort((a, b) => a.数 - b.数);
      return 回(res, 200, {
        ok: true,
        有数据: true,
        插件数: 快照.plugins.length,
        样本说明: '样本按 star 排序 + 最近更新取样，冷门插件不在样本里；零命中不等于没人做',
        行业: 排序(命中数(INDUSTRY, 快照.plugins)),
        能力: 排序(命中数(CAPABILITY, 快照.plugins)),
      });
    }

    if (路 === '/api/report' && req.method === 'GET') {
      const 报 = 读最新报告();
      return 回(res, 200, 报 ? { ok: true, 有数据: true, ...报 } : { ok: true, 有数据: false });
    }

    if (路 === '/api/refresh' && req.method === 'POST') {
      const r = await 刷新快照();
      return 回(res, 200, { ...r, 概览: 概览(读快照()) });
    }

    return 回(res, 404, { ok: false, 原因: '未知路径：' + 路 });
  };
}

export function apply(ctx) {
  if (ctx.webServer && typeof ctx.webServer.register === 'function') {
    const handler = 建处理器();
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler }), 'ecosystem-radar: http 出口');
    ctx.logger?.info?.('[ecosystem-radar] 已挂 HTTP 出口 ' + ROUTE + '/api');
  } else {
    ctx.logger?.warn?.('[ecosystem-radar] 没有 webServer 服务，面板会取不到数据');
  }
}

export default { name, inject, apply };
