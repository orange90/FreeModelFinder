#!/usr/bin/env node
// Rewrites the generated free-model block in README.md and creates the stable
// FREE_MODELS.md catalog from reports/latest.json. Do not hand-edit content
// between the README markers; the daily audit replaces it.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const README_PATH = join(REPO_ROOT, 'README.md');
const FREE_MODELS_PATH = join(REPO_ROOT, 'FREE_MODELS.md');
const SNAPSHOT_PATH = join(REPO_ROOT, 'reports', 'latest.json');
const START_MARK = '<!-- AUDIT-SUMMARY-START -->';
const END_MARK = '<!-- AUDIT-SUMMARY-END -->';

const FREE_TYPE_BY_ID = {
  openrouter: '零价格模型',
  gemini: '账号 Free Tier',
  zhipu: '官方免费型号',
  siliconflow: '免费白名单',
  modelscope: '账号免费额度',
  nvidia: '免费开发端点',
  github: '原型开发额度',
  cohere: '免费 Trial/Production',
  huggingface: '实时零价端点',
  sensenova: '实时零价模型',
};

if (!existsSync(SNAPSHOT_PATH)) {
  console.error(`[readme] ${SNAPSHOT_PATH} is missing. Run \`pnpm audit:free-models\` first.`);
  process.exit(2);
}

function parseModelsFromReport(markdown) {
  const models = new Map();
  let providerId = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^### .+ \(([^)]+)\)$/);
    if (heading) {
      providerId = heading[1];
      if (!models.has(providerId)) models.set(providerId, []);
      continue;
    }
    if (!providerId) continue;
    const item = line.match(/^- `([^`]+)`(?: — (.+))?$/);
    if (!item) continue;
    models.get(providerId).push({
      id: item[1],
      displayName: item[2] || item[1],
      contextWindow: null,
    });
  }
  return models;
}

async function hydrateSnapshotModels(snapshot) {
  const hasModels = snapshot.providers?.some((provider) => Array.isArray(provider.models));
  if (hasModels || !snapshot.reportPath) return snapshot;
  const reportPath = join(REPO_ROOT, snapshot.reportPath);
  if (!existsSync(reportPath)) return snapshot;
  const byProvider = parseModelsFromReport(await readFile(reportPath, 'utf8'));
  return {
    ...snapshot,
    providers: snapshot.providers.map((provider) => ({
      ...provider,
      models: byProvider.get(provider.id) ?? [],
    })),
  };
}

function countCell(provider) {
  if (provider.status === 'ok') return String(provider.count);
  if (provider.status === 'skipped') return '未接入';
  if (provider.status === 'error') return '暂不可用';
  return '—';
}

function statusCell(provider) {
  if (provider.status === 'ok') return '🟢 正常';
  if (provider.status === 'skipped') return '⚪ 未接入';
  if (provider.status === 'error') return '🔴 失败';
  return '🟡 未知';
}

function freeType(provider) {
  return provider.freeType ?? FREE_TYPE_BY_ID[provider.id] ?? '免费规则过滤';
}

function escapeTable(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
}

function fullModelId(providerId, modelId) {
  return `${providerId}:${modelId}`;
}

function formatContextWindow(value) {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return String(value);
}

function renderChangeList(changes, compact) {
  if (!changes?.comparedWith) {
    return compact
      ? '> 首次建立可比较基线，下一次审计开始显示新增与移除。'
      : '首次建立可比较基线，下一次审计开始显示新增与移除。';
  }
  const added = Array.isArray(changes.added) ? changes.added : [];
  const removed = Array.isArray(changes.removed) ? changes.removed : [];
  const comparedProviders = Array.isArray(changes.comparedProviders)
    ? changes.comparedProviders
    : [];
  if (comparedProviders.length === 0) {
    return compact
      ? '> 本次没有同时成功返回的前后两期 Provider，暂不计算新增与移除。'
      : '本次没有同时成功返回的前后两期 Provider，暂不计算新增与移除。';
  }
  if (added.length === 0 && removed.length === 0) {
    return `与 ${changes.comparedWith} 相比，成功比较的 ${comparedProviders.length} 个 Provider 模型清单没有变化。`;
  }

  const lines = [
    `与 ${changes.comparedWith} 相比，在成功比较的 ${comparedProviders.length} 个 Provider 中：**新增 ${added.length} 个，移除 ${removed.length} 个**。`,
  ];
  if (compact) {
    if (added.length > 0) {
      lines.push(
        '',
        '<details>',
        `<summary>查看新增的 ${added.length} 个模型</summary>`,
        '',
        ...added.map((model) => `- \`${fullModelId(model.provider, model.id)}\``),
        '',
        '</details>',
      );
    }
    if (removed.length > 0) {
      lines.push(
        '',
        '<details>',
        `<summary>查看移除的 ${removed.length} 个模型</summary>`,
        '',
        ...removed.map((model) => `- \`${fullModelId(model.provider, model.id)}\``),
        '',
        '</details>',
      );
    }
    return lines.join('\n');
  }

  if (added.length > 0) {
    lines.push(
      '',
      '### 新增',
      '',
      ...added.map((model) => `- \`${fullModelId(model.provider, model.id)}\``),
    );
  }
  if (removed.length > 0) {
    lines.push(
      '',
      '### 移除',
      '',
      ...removed.map((model) => `- \`${fullModelId(model.provider, model.id)}\``),
    );
  }
  return lines.join('\n');
}

function renderProviderDetails(provider) {
  if (provider.status !== 'ok') return '';
  const models = Array.isArray(provider.models) ? provider.models : [];
  const lines = models.length
    ? models.map((model) => {
        const display =
          model.displayName && model.displayName !== model.id ? ` — ${model.displayName}` : '';
        return `- \`${fullModelId(provider.id, model.id)}\`${display}`;
      })
    : ['- 本次目录中没有命中免费过滤的模型。'];
  return `<details>
<summary><strong>${provider.display} · ${provider.count} 个模型</strong></summary>

${lines.join('\n')}

</details>`;
}

function renderReadmeBlock(snapshot) {
  const okProviders = snapshot.providers.filter((provider) => provider.status === 'ok');
  const skipped = snapshot.providers.filter((provider) => provider.status === 'skipped');
  const errored = snapshot.providers.filter((provider) => provider.status === 'error');
  const notes = [];
  if (skipped.length > 0) notes.push(`未配置密钥：${skipped.map((p) => p.display).join('、')}。`);
  if (errored.length > 0) notes.push(`本次目录失败：${errored.map((p) => p.display).join('、')}。`);
  const noteLine = notes.length > 0 ? `\n> ${notes.join(' ')}\n` : '';
  const rows = snapshot.providers.map(
    (provider) =>
      `| ${provider.display} | ${statusCell(provider)} | ${countCell(provider)} | ${freeType(provider)} |`,
  );
  const details = snapshot.providers.map(renderProviderDetails).filter(Boolean).join('\n\n');

  return `${START_MARK}

> **目录审计于 ${snapshot.date}（Asia/Shanghai）更新：${snapshot.totalModels} 个免费模型入口，覆盖 ${okProviders.length}/${snapshot.providers.length} 个 Provider。** 这里统计的是通过免费规则过滤的 Provider 模型入口，同一模型出现在多个 Provider 时会分别计数；本次未发送真实推理请求。
${noteLine}
| Provider | 状态 | 免费模型数 | 免费类型 |
| --- | --- | ---: | --- |
${rows.join('\n')}

[查看稳定的完整免费模型清单](FREE_MODELS.md) · [查看本次目录审计报告](${snapshot.reportPath})

### 今日变化

${renderChangeList(snapshot.changes, true)}

### 展开完整模型列表

${details}

${END_MARK}`;
}

function renderFreeModels(snapshot) {
  const okProviders = snapshot.providers.filter((provider) => provider.status === 'ok');
  const rows = snapshot.providers.map(
    (provider) =>
      `| ${provider.display} | ${statusCell(provider)} | ${countCell(provider)} | ${freeType(provider)} | ${escapeTable(provider.freeBasis)} |`,
  );
  const sections = snapshot.providers
    .map((provider) => {
      const models = Array.isArray(provider.models) ? provider.models : [];
      const header = `### ${provider.display}`;
      const metadata = `- Provider ID：\`${provider.id}\`
- 状态：${statusCell(provider)}
- 免费依据：${provider.freeBasis}
- 主要风险：${provider.risk}`;
      if (provider.status !== 'ok') return `${header}\n\n${metadata}\n\n本次没有可展示的模型清单。`;
      if (models.length === 0) {
        return `${header}\n\n${metadata}\n\n目录接口成功，但没有命中免费过滤的模型。`;
      }
      const modelRows = models.map(
        (model) =>
          `| \`${fullModelId(provider.id, model.id)}\` | ${escapeTable(model.displayName ?? model.id)} | ${formatContextWindow(model.contextWindow)} |`,
      );
      return `${header}

${metadata}

| Gateway 模型 ID | 显示名称 | 上下文窗口 |
| --- | --- | ---: |
${modelRows.join('\n')}`;
    })
    .join('\n\n');

  return `# FreeModelFinder 免费模型清单

<!-- 此文件由 scripts/update-readme-audit.mjs 自动生成，请勿手动编辑。 -->

> 最近目录审计：**${snapshot.date}（Asia/Shanghai）** · **${snapshot.totalModels}** 个免费模型入口 · **${okProviders.length}/${snapshot.providers.length}** 个 Provider 正常。

[返回项目 README](README.md) · [查看本次目录审计报告](${snapshot.reportPath})

这份列表每天由 GitHub Actions 通过各 Provider 的模型目录接口刷新，并应用 FreeModelFinder 核心层的免费规则。它不执行真实推理，不代表无限额度、永久免费或生产级可用。同一上游模型通过多个 Provider 提供时会分别计数，因为对应的账号资格、额度和 Gateway 模型 ID 不同。

## 今日变化

${renderChangeList(snapshot.changes, false)}

## Provider 汇总

| Provider | 状态 | 免费模型数 | 免费类型 | 免费依据 |
| --- | --- | ---: | --- | --- |
${rows.join('\n')}

## 完整列表

${sections}
`;
}

const rawSnapshot = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));
const snapshot = await hydrateSnapshotModels(rawSnapshot);
const readme = await readFile(README_PATH, 'utf8');
const startIdx = readme.indexOf(START_MARK);
const endIdx = readme.indexOf(END_MARK);
if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
  console.error('[readme] audit summary markers not found in README.md');
  process.exit(1);
}

const block = renderReadmeBlock(snapshot);
const rawNextReadme = readme.slice(0, startIdx) + block + readme.slice(endIdx + END_MARK.length);
const nextReadme = await prettier.format(rawNextReadme, { parser: 'markdown' });
const nextFreeModels = await prettier.format(renderFreeModels(snapshot), { parser: 'markdown' });
let changed = false;

if (nextReadme !== readme) {
  await writeFile(README_PATH, nextReadme, 'utf8');
  changed = true;
  console.error(`[readme] updated audit summary for ${snapshot.date}.`);
}

const currentFreeModels = existsSync(FREE_MODELS_PATH)
  ? await readFile(FREE_MODELS_PATH, 'utf8')
  : '';
if (nextFreeModels !== currentFreeModels) {
  await writeFile(FREE_MODELS_PATH, nextFreeModels, 'utf8');
  changed = true;
  console.error(`[readme] updated ${FREE_MODELS_PATH}.`);
}

if (!changed) console.error('[readme] no changes; generated documentation is already up to date.');
