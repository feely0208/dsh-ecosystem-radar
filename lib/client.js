/**
 * 深鲸生态雷达 —— 客户端半边（面板 UI）
 *
 * 挂两个槽位：
 *   · sidebar.panellist → 侧栏图标「生态雷达」
 *   · main（keyed, key='ecosystem-radar'）→ 主区面板
 *
 * 数据全走 `/dsh-ecosystem-radar/api`（同源，无需握手）：
 *   overview / new / gaps / report / refresh / badge
 *
 * 设计取向：一屏说清「生态现在什么样、哪里有空白、今天有什么变化」，
 * 不放图表堆砌，只放能直接做决定的三块：新增、空位、报告。
 */
window.__ModuleLoader__.load({
  id: '@deepwhale-cn/dsh-ecosystem-radar',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    let react = require('react');
    const h = react.createElement;

    const API = '/dsh-ecosystem-radar/api';
    const SLOT_ICON = 'sidebar.panellist';
    const SLOT_MAIN = 'main';
    const PANEL_ID = 'ecosystem-radar';

    /* ── 样式（深浅主题都用 currentColor，不猜宿主变量名） ── */
    const V = {
      卡底: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.10))',
      浅底: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.14))',
      边: 'var(--dsw-alias-border-l1, rgba(127,127,127,0.28))',
      差: 'var(--dsw-alias-state-error-primary, #D64541)',
    };
    const 好 = '#2E9E5B', 警 = '#C77F1A';
    const 卡样式 = { background: V.卡底, border: '1px solid ' + V.边, borderRadius: 10, padding: '10px 12px', marginBottom: 10, color: 'inherit' };
    const 小字 = { fontSize: 12, opacity: 0.72, lineHeight: 1.6 };
    const 正字 = { fontSize: 13, color: 'inherit' };
    const 按钮 = (主要) => ({
      background: 主要 ? 'rgba(127,127,127,0.20)' : V.浅底,
      color: 'inherit', border: '1px solid ' + V.边, borderRadius: 8,
      padding: '5px 12px', cursor: 'pointer', fontSize: 12,
      ...(主要 ? { boxShadow: 'inset 0 0 0 1.6px currentColor', fontWeight: 600 } : {}),
    });
    const 标签 = (选) => ({
      ...按钮(选), padding: '4px 12px', borderRadius: 999,
    });

    async function 取(路, 选项) {
      const res = await fetch(API + 路, 选项);
      return res.json();
    }

    function 数字(n) {
      n = Number(n) || 0;
      return n >= 10000 ? (n / 10000).toFixed(1) + ' 万' : String(n);
    }

    function 徽章() {
      return h('a', {
        href: 'https://deepwhale.org.cn', target: '_blank', rel: 'noopener',
        style: { padding: '6px 12px', display: 'flex', justifyContent: 'flex-end', flex: '0 0 auto' },
      }, [h('img', { src: API + '/badge', alt: 'powered by dwh', style: { height: '20px', width: '121px', display: 'block' } })]);
    }

    function 面板() {
      const [概览, 设概览] = react.useState(null);
      const [新增, 设新增] = react.useState(null);
      const [空位, 设空位] = react.useState(null);
      const [报告, 设报告] = react.useState(null);
      const [页, 设页] = react.useState('概览');
      const [忙, 设忙] = react.useState('');
      const [错, 设错] = react.useState('');

      const 载入 = async () => {
        设错('');
        try {
          if (页 === '概览') 设概览(await 取('/overview'));
          if (页 === '新增') 设新增(await 取('/new?days=7&limit=30'));
          if (页 === '供给') 设空位(await 取('/gaps'));
          if (页 === '报告') 设报告(await 取('/report'));
        } catch (e) { 设错(String(e && e.message || e)); }
      };
      react.useEffect(() => { 载入(); }, [页]);

      const 刷新 = async () => {
        设忙('刷新快照…'); 设错('');
        try {
          const r = await 取('/refresh', { method: 'POST' });
          if (!r.ok) 设错(r.原因 || '刷新失败');
          设概览(r.概览 || 概览);
          设新增(null); 设空位(null); 设报告(null);
          载入();
        } catch (e) { 设错(String(e && e.message || e)); }
        finally { 设忙(''); }
      };

      /* ── 概览 ── */
      const 概览卡 = !概览 ? h('div', { style: 小字 }, '加载中…') : h('div', null, [
        h('div', { key: 'stats', style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 } }, [
          统计('插件总数', 数字(概览.插件数), '本机快照里的 DSH 插件仓库数'),
          统计('近 7 天新增', 数字(概览.近7天新增), '新冒出来的仓库'),
          统计('Star 总量', 数字(概览.star总量), '样本的体量，不是需求'),
          统计('最新报告', 概览.最新报告日期 || '无', '每日增量'),
        ]),
        h('div', { key: 'meta', style: 小字 }, [
          h('div', { key: 'a' }, '采样时间：' + (概览.采样时间 || '还没有快照')),
          h('div', { key: 'b' }, '数据目录：' + 概览.数据目录),
          h('div', { key: 'c' }, 概览.有数据 ? ('报告：' + (概览.最新报告日期 || '暂无')) : '还没有 snapshot.json —— 点「刷新快照」先抓一次'),
        ]),
      ]);

      /* ── 新增 ── */
      const 新增卡 = !新增 ? h('div', { style: 小字 }, '加载中…')
        : !新增.有数据 ? h('div', { style: 小字 }, '还没有快照数据，先回概览点「刷新快照」。')
          : h('div', null, [
            h('div', { key: 't', style: 小字 }, `近 ${新增.天数} 天新增 ${新增.项.length} 个（按 ★ 排序，最多 30 个）`),
            ...新增.项.map((p, i) => h('div', { key: i, style: { padding: '7px 0', borderTop: i ? '1px solid ' + V.边 : 'none' } }, [
              h('div', { key: 'a', style: { ...正字, display: 'flex', justifyContent: 'space-between', gap: 8 } }, [
                h('a', { key: 'r', href: p.URL, target: '_blank', rel: 'noopener', style: { color: 'inherit' } }, p.仓库),
                h('span', { key: 's', style: { color: 好, whiteSpace: 'nowrap' } }, '★ ' + 数字(p.星)),
              ]),
              h('div', { key: 'd', style: 小字 }, p.说明 || '（无说明）'),
            ])),
          ]);

      /* ── 空位榜 ── */
      const 排 = (表, 标题, 说明) => h('div', { key: 标题, style: { marginBottom: 12 } }, [
        h('div', { key: 'h', style: { ...正字, fontWeight: 600, marginBottom: 4 } }, 标题 + ' · ' + 说明),
        ...表.slice(0, 18).map((r, i) => h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' } }, [
          h('span', { key: 'k', style: { width: 78, flex: '0 0 78px', ...正字 } }, [
            r.标签,
            r.我方有 ? h('span', { key: 'o', style: { color: 好, fontSize: 10.5, marginLeft: 3 } }, '我方') : null,
          ]),
          h('span', { key: 'b', style: { flex: 1, height: 6, background: V.浅底, borderRadius: 3, overflow: 'hidden' } },
            [h('span', {
              key: 'f', style: {
                display: 'block', height: '100%', width: Math.min(100, (r.数 / Math.max(1, 表[表.length - 1].数 || 1)) * 100) + '%',
                background: r.数 <= 1 ? 好 : (r.数 <= 4 ? 警 : 'rgba(127,127,127,0.55)'),
              },
            })]),
          h('span', { key: 'n', style: { width: 34, flex: '0 0 34px', textAlign: 'right', ...小字 } }, r.数 + ' 个'),
        ])),
      ]);

      const 空位卡 = !空位 ? h('div', { style: 小字 }, '加载中…')
        : !空位.有数据 ? h('div', { style: 小字 }, '还没有快照数据，先回概览点「刷新快照」。')
          : h('div', null, [
            h('div', { key: 'tip', style: 小字 }, '供给数 = 快照样本（' + 空位.插件数 + ' 个，按 star + 最近更新取样）里名称/描述命中该词的数；**零命中多半是冷门插件没进样本，不等于没人做**。标「我方」的是我们已有产品的格子。'),
            h('div', { key: 'i', style: { marginTop: 8 } }, 排(空位.行业, '行业', '样本内供给，越靠前越少')),
            h('div', { key: 'c', style: { marginTop: 8 } }, 排(空位.能力, '能力', '工具类供给密度')),
            h('div', { key: 'w', style: { ...小字, marginTop: 6 } }, '⚠️ 供给为 0 不等于有机会 —— 也可能根本没人要。需求要回到三个判据人工核实。'),
          ]);

      /* ── 报告 ── */
      const 报告卡 = !报告 ? h('div', { style: 小字 }, '加载中…')
        : !报告.有数据 ? h('div', { style: 小字 }, '还没有每日增量报告。')
          : h('div', null, [
            h('div', { key: 't', style: 小字 }, '最新报告 · ' + 报告.日期 + '（' + 报告.文件 + '）'),
            h('pre', {
              key: 'p', style: {
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.7,
                background: V.浅底, border: '1px solid ' + V.边, borderRadius: 8,
                padding: 10, marginTop: 8, maxHeight: '60vh', overflow: 'auto', color: 'inherit',
              },
            }, 报告.文本),
          ]);

      const 主体 = { 概览: 概览卡, 新增: 新增卡, 供给: 空位卡, 报告: 报告卡 }[页];

      return h('div', { style: { padding: '14px 16px', height: '100%', overflow: 'auto', color: 'inherit', background: 'transparent' } }, [
        h('div', { key: 'hd', style: { ...卡样式, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 } }, [
          h('div', { key: 'l', style: { fontSize: 14, fontWeight: 600 } }, '深鲸生态雷达  ' + (概览 && 概览.采样时间 ? '· ' + 概览.采样时间.slice(0, 10) : '')),
          h('div', { key: 'r', style: { display: 'flex', gap: 8, alignItems: 'center' } }, [
            忙 ? h('span', { key: 'b', style: 小字 }, 忙) : null,
            h('button', { key: 'rf', style: 按钮(true), onClick: 刷新, disabled: !!忙 }, '刷新快照'),
          ]),
        ]),
        h('div', { key: 'tabs', style: { display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' } },
          ['概览', '新增', '供给', '报告'].map((t) => h('button', { key: t, style: 标签(页 === t), onClick: () => 设页(t) }, t))),
        错 ? h('div', { key: 'e', style: { ...卡样式, borderColor: V.差, color: V.差, whiteSpace: 'pre-wrap' } }, 错) : null,
        h('div', { key: 'body' }, 主体),
        h('div', { key: 'f', style: { ...小字, marginTop: 8 } }, '数据来自本机雷达快照（只读）；刷新会跑一次 radar.sh snapshot，受 GitHub 限流影响可能要几十秒。'),
        h('div', { key: 'badge' },
          [h('a', { key: 'a', href: 'https://deepwhale.org.cn', target: '_blank', rel: 'noopener', style: { display: 'inline-block', marginTop: 10 } },
            h('img', { src: API + '/badge', alt: 'powered by dwh', style: { height: '20px', width: '121px', display: 'block' } }))]),
      ]);
    }

    function 统计(标题, 值, 注) {
      return h('div', { style: { flex: '1 1 120px', minWidth: 120, background: V.浅底, border: '1px solid ' + V.边, borderRadius: 8, padding: '8px 10px' } }, [
        h('div', { key: 't', style: { ...小字, fontSize: 11 } }, 标题),
        h('div', { key: 'v', style: { fontSize: 20, fontWeight: 600, lineHeight: 1.3 } }, 值),
        h('div', { key: 'n', style: { ...小字, fontSize: 10.5 } }, 注),
      ]);
    }

    /* ── 侧栏图标（雷达/同心圆） ── */
    function 图标({ size = 18, active }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: active ? 2 : 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
      }, [
        h('circle', { key: 'a', cx: 12, cy: 12, r: 9 }),
        h('circle', { key: 'b', cx: 12, cy: 12, r: 5 }),
        h('circle', { key: 'c', cx: 12, cy: 12, r: 1.4, fill: 'currentColor', stroke: 'none' }),
        h('path', { key: 'd', d: 'M12 12L18 7' }),
      ]);
    }

    function 安全面板(props) {
      try { return 面板(props); } catch (e) { return h('div', { style: { padding: 12 } }, '生态雷达面板出错：' + String(e && e.message || e)); }
    }

    const inject = ['slots'];
    function apply(ctx) {
      ctx.slots.inject(SLOT_MAIN, function* () {
        yield ctx.slots.register({ name: SLOT_MAIN, key: PANEL_ID }, 安全面板);
      });
      ctx.slots.inject(SLOT_ICON, function* () {
        yield ctx.slots.register({ name: SLOT_ICON, id: PANEL_ID, order: 22, label: '生态雷达' }, 图标);
      });
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
