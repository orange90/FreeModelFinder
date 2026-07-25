#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const DATA_PATH = join(ROOT, 'free-models.json');
const README_PATH = join(ROOT, 'README.md');
const START_MARK = '<!-- FREE_MODELS_TABLE:START -->';
const END_MARK = '<!-- FREE_MODELS_TABLE:END -->';

const MODALITY_LABEL = {
  text: '文本',
  vision: '视觉',
  reasoning: '推理',
};

function fmtNum(n) {
  if (n === undefined || n === null) return '—';
  return typeof n === 'number' ? n.toLocaleString('en-US') : String(n);
}

function fmtRate(model) {
  const parts = [];
  if (model.reqPerMin) parts.push(`${model.reqPerMin} RPM`);
  if (model.reqPerHour) parts.push(`${model.reqPerHour} RPH`);
  if (model.reqPerDay) parts.push(`${model.reqPerDay.toLocaleString('en-US')} RPD`);
  return parts.length ? parts.join(' / ') : '—';
}

function fmtIntel(model) {
  const bits = [];
  if (model.intelligenceIndex !== undefined) bits.push(`AA ${model.intelligenceIndex}`);
  if (model.arenaElo !== undefined) bits.push(`Elo ${model.arenaElo}`);
  return bits.length ? bits.join(' · ') : '—';
}

function escapePipes(s) {
  return String(s).replace(/\|/g, '\\|');
}

function renderTable(data) {
  const lines = [];
  lines.push(`> 自动生成，请勿手动编辑；数据源：\`free-models.json\`。最后更新：${data.generatedAt}`);
  lines.push('');
  lines.push(
    '| 提供商 | 模型 | 模态 | 上下文 (K) | 速率限制 | 吞吐 (tps) | 智能水平 | API Base URL |',
  );
  lines.push(
    '| --- | --- | --- | ---: | --- | ---: | --- | --- |',
  );

  for (const p of data.providers) {
    for (const m of p.models) {
      const providerCell = `[${escapePipes(p.label)}](${p.homepage})`;
      const modelCell = `\`${escapePipes(m.name)}\``;
      const modalityCell = MODALITY_LABEL[m.modality] ?? '文本';
      const ctxCell = fmtNum(m.contextK);
      const rateCell = fmtRate(m);
      const tpsCell = fmtNum(m.throughputTps);
      const intelCell = fmtIntel(m);
      const apiCell = `\`${p.apiBaseUrl}\``;
      lines.push(
        `| ${providerCell} | ${modelCell} | ${modalityCell} | ${ctxCell} | ${rateCell} | ${tpsCell} | ${intelCell} | ${apiCell} |`,
      );
    }
  }

  lines.push('');
  lines.push('### 各提供商免费额度说明');
  lines.push('');
  for (const p of data.providers) {
    const key = p.keyUrl ? `[申请 Key](${p.keyUrl})` : '';
    lines.push(`- **${p.label}** — ${p.limits ?? ''} ${key}`.trim());
  }
  return lines.join('\n');
}

function main() {
  const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  const table = renderTable(data);

  const readme = readFileSync(README_PATH, 'utf8');
  const startIdx = readme.indexOf(START_MARK);
  const endIdx = readme.indexOf(END_MARK);
  if (startIdx === -1 || endIdx === -1) {
    console.error(
      `[update-readme] Missing markers in README.md. Expected ${START_MARK} and ${END_MARK}.`,
    );
    process.exit(1);
  }
  if (endIdx < startIdx) {
    console.error('[update-readme] END marker appears before START marker.');
    process.exit(1);
  }

  const before = readme.slice(0, startIdx + START_MARK.length);
  const after = readme.slice(endIdx);
  const next = `${before}\n\n${table}\n\n${after}`;

  if (next === readme) {
    console.log('[update-readme] README already up to date.');
    return;
  }
  writeFileSync(README_PATH, next, 'utf8');
  const totalModels = data.providers.reduce((sum, p) => sum + p.models.length, 0);
  console.log(
    `[update-readme] Updated README with ${totalModels} models across ${data.providers.length} providers.`,
  );
}

main();
