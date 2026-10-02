import { bodyPose } from './body-layout';
import { INFO, MUTATIONS, PARTS } from './content';
import { cost, mutationBlock } from './simulation';
import type { MutationId, Part, State } from './types';
const name = (id: MutationId) => MUTATIONS.find(m => m.id === id)!.name;
function link(id: MutationId, s: State): string {
  return `<button class="relation ${s.mutations.includes(id) ? 'active' : ''}" data-related="${id}">${name(id)}${s.mutations.includes(id) ? ' ✓' : ''}</button>`;
}
export function bodyUI(s: State, selected: Part | null, inspecting: MutationId | null, height: number): string {
  const pose = bodyPose(height, !!selected);
  const owned = s.mutations.map(id => MUTATIONS.find(m => m.id === id)!);
  const hotspots = PARTS.map(p => {
    const count = owned.filter(m => m.part === p.id).length;
    const left = (195 + p.x * pose.scale) / 390 * 100, top = (pose.head + p.y * pose.scale) / height * 100;
    return `<button class="body-point point-${p.id} ${selected === p.id ? 'selected' : ''}" style="left:${left}%;top:${top}%" data-part="${p.id}" aria-label="${p.name}を選択" aria-pressed="${selected === p.id}"><span class="point-ring">${count ? count : '+'}</span><span class="point-label">${p.name.split('・')[0]}</span></button>`;
  }).join('');
  const part = PARTS.find(p => p.id === selected);
  const candidates = MUTATIONS.filter(m => m.part === selected);
  const tiers = [...new Set(candidates.map(m => m.tier ?? 1))].sort();
  const inspected = candidates.find(m => m.id === inspecting);
  const groups = tiers.map(tier => `<section class="mutation-tier"><h4>${String(tier).padStart(2, '0')} <span>${tier === 1 ? '基礎変異' : '深部変異'}</span></h4><div class="candidate-grid">${candidates.filter(m => (m.tier ?? 1) === tier).map(m => {
    const owned = s.mutations.includes(m.id), block = mutationBlock(s, m.id), info = INFO[m.id];
    const relation = m.requires?.length ? m.requires.map(name).join(' + ')+' → ' : info.tradeoff ? info.tradeoff+' · ' : '';
    const status = owned ? '取得済み' : block?.startsWith('前提:') ? '前提未取得' : block === info.tradeoff ? '選択不可' : block ?? '取得可能';
    return `<button class="candidate ${owned ? 'owned' : ''} ${inspected?.id === m.id ? 'selected' : ''}" data-inspect="${m.id}" aria-pressed="${inspected?.id === m.id}"><span class="candidate-family">${info.family}${owned ? ' · 取得済み' : ''}</span><span class="candidate-title">${m.name}<b>${owned ? '✓' : '◇ '+cost(s,m.id)}</b></span><span class="candidate-stat">${info.stats[0][0]} <strong>${info.stats[0][1]}</strong></span><span class="candidate-condition">${relation}${status}</span></button>`;
  }).join('')}</div></section>`).join('');
  let detail = '';
  if (inspected) {
    const m = inspected, info = INFO[m.id], block = mutationBlock(s, m.id);
    const next = MUTATIONS.filter(other => other.requires?.includes(m.id));
    detail = `<article class="mutation-detail" aria-label="${m.name}の詳細"><header><div><small>${info.family} / 段階${m.tier ?? 1}</small><h3>${m.name}</h3></div><span>${s.mutations.includes(m.id) ? '取得済み' : '◇ '+cost(s,m.id)}</span></header><p>${m.description}</p><dl><div><dt>発動</dt><dd>${info.trigger}</dd></div>${info.stats.map(([k,v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>${info.tradeoff ? `<p class="tradeoff">↔ ${info.tradeoff}</p>` : ''}<div class="relations">${m.requires?.length ? `<div><span>前提</span>${m.requires.map(id => link(id,s)).join('')}<b>→ ${m.name}</b></div>` : ''}${m.excludes?.length ? `<div><span>排他</span>${m.excludes.map(id => link(id,s)).join('')}</div>` : ''}${next.length ? `<div><span>次に開く</span>${next.map(m => link(m.id,s)).join('')}</div>` : ''}<div><span>相性</span>${info.synergy.map(id => link(id,s)).join('')}</div></div><button class="purchase" data-mutate="${m.id}" ${block ? 'disabled' : ''}>${block ?? `${m.name}を取得 · ◇ ${cost(s,m.id)}`}<span>${!block ? `残り ◇ ${s.growth-cost(s,m.id)}` : ''}</span></button></article>`;
  }
  return `<header class="build-header"><b>BODY / BUILD</b><span aria-label="成長資源">◇ ${s.growth}</span></header><div class="body-map" aria-label="身体の部位">${hotspots}</div>${part ? `<section class="choices" aria-label="${part.name}の変異"><div class="choice-heading"><div><small>${part.note}</small><h2>${part.name}</h2></div><button aria-label="身体全体に戻る" data-action="close">×</button></div><nav class="part-tabs" aria-label="部位を切り替える">${PARTS.map(p=>`<button data-part="${p.id}" aria-pressed="${selected===p.id}" class="${selected===p.id?'selected':''}">${p.name.split('・')[0]}</button>`).join('')}</nav><div class="choices-scroll">${groups}${detail || '<div class="detail-placeholder">変異を選択すると数値と関係を表示</div>'}</div></section>` : `<section class="build-summary"><header><b>現在の身体</b><span>${owned.length} 変異</span></header><div>${owned.length ? owned.map(m => link(m.id,s)).join('') : '<span class="empty-build">基礎形態</span>'}</div></section>`}`;
}
