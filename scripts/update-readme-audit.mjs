#!/usr/bin/env node
// Rewrites the AUDIT-SUMMARY block in README.md using reports/latest.json.
//
// Consumes the snapshot produced by scripts/audit-free-models.mjs and
// replaces everything between <!-- AUDIT-SUMMARY-START --> and
// <!-- AUDIT-SUMMARY-END --> with a fresh table + link.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const README_PATH = join(REPO_ROOT, 'README.md');
const SNAPSHOT_PATH = join(REPO_ROOT, 'reports', 'latest.json');
const START_MARK = '<!-- AUDIT-SUMMARY-START -->';
const END_MARK = '<!-- AUDIT-SUMMARY-END -->';

if (!existsSync(SNAPSHOT_PATH)) {
  console.error(`[readme] ${SNAPSHOT_PATH} is missing. Run \`pnpm audit:free-models\` first.`);
  process.exit(2);
}

const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));
const readme = await readFile(README_PATH, 'utf8');

const startIdx = readme.indexOf(START_MARK);
const endIdx = readme.indexOf(END_MARK);
if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
  console.error('[readme] audit summary markers not found in README.md');
  process.exit(1);
}

function countCell(provider) {
  if (provider.status === 'ok') return String(provider.count);
  if (provider.status === 'skipped') return '未接入';
  if (provider.status === 'error') return '暂不可用';
  return '—';
}

const rows = snapshot.providers.map((p) => {
  return `| ${p.display} | ${countCell(p)} | ${p.freeBasis} | ${p.risk} |`;
});

const okProviders = snapshot.providers.filter((p) => p.status === 'ok');
const skipped = snapshot.providers.filter((p) => p.status === 'skipped');
const errored = snapshot.providers.filter((p) => p.status === 'error');

const notes = [];
if (skipped.length > 0) {
  notes.push(`未配置 API 密钥而跳过：${skipped.map((p) => p.display).join('、')}。`);
}
if (errored.length > 0) {
  notes.push(`目录接口本次失败：${errored.map((p) => p.display).join('、')}。`);
}
const noteLine = notes.length > 0 ? `\n> ${notes.join(' ')}\n` : '';

const block = `${START_MARK}

下表由 GitHub Actions 每日自动刷新。最近一次审计时间：**${snapshot.date}（Asia/Shanghai）**，共命中 **${snapshot.totalModels}** 个免费模型（覆盖 ${okProviders.length}/${snapshot.providers.length} 个 provider）。完整实测记录见 [Provider 审计报告](${snapshot.reportPath})。
${noteLine}
| 内置 Provider | 实时免费模型数 | 免费判定 | 主要计费与可用性风险 |
| --- | ---: | --- | --- |
${rows.join('\n')}

${END_MARK}`;

const next = readme.slice(0, startIdx) + block + readme.slice(endIdx + END_MARK.length);

if (next === readme) {
  console.error('[readme] no changes; already up to date.');
  process.exit(0);
}

await writeFile(README_PATH, next, 'utf8');
console.error(`[readme] updated audit summary for ${snapshot.date}.`);
