'use strict';

/**
 * chain-reader.js — 扫 features/，解析 chain.json，校验 md/ref 存在性。
 * 纪律：缺 md 报诚实「待生成」不崩；文件/解析错误收集上报，不抛异常。
 */

const fs = require('fs');
const path = require('path');
const { validateChain, STAGE_TYPES } = require('./schema');
const { ROOT, FEATURES_DIR, resolvePath } = require('./registry');

/** 列出全部功能（目录即注册；跳过无 chain.json 的目录并报告） */
function listFeatures() {
  const out = { features: [], errors: [] };
  let entries;
  try {
    entries = fs.readdirSync(FEATURES_DIR, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return out; // features/ 不存在 = 空工作台
    out.errors.push(`features/ 读取失败: ${e.message}`);
    return out;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const cf = path.join(FEATURES_DIR, ent.name, 'chain.json');
    if (!fs.existsSync(cf)) {
      out.errors.push(`features/${ent.name}/ 缺少 chain.json（跳过）`);
      continue;
    }
    const r = readChain(ent.name);
    if (r.error) out.errors.push(`features/${ent.name}/chain.json: ${r.error}`);
    else out.features.push(r.chain);
  }
  out.features.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/** 读取单条链。返回 { chain } 或 { error } */
function readChain(featId) {
  const cf = path.join(FEATURES_DIR, featId, 'chain.json');
  let raw;
  try {
    raw = fs.readFileSync(cf, 'utf8');
  } catch (e) {
    return { error: `读取失败: ${e.message}` };
  }
  let chain;
  try {
    chain = JSON.parse(raw);
  } catch (e) {
    return { error: `JSON 解析失败: ${e.message}` };
  }
  const errs = validateChain(chain);
  if (errs.length) return { error: errs.join('; ') };
  return { chain };
}

/** 环节的 md 状态：有 md 且文件存在 → 路径；无 md → '待生成'；有 md 缺文件 → '缺失!'
 *  md 相对 features/<功能id>/ 解析（与 chain.json 落盘时一致） */
function mdState(stage, featId) {
  if (!stage.md) return { label: '待生成', kind: 'pending' };
  const abs = path.join(FEATURES_DIR, featId, stage.md);
  if (fs.existsSync(abs)) return { label: stage.md, kind: 'real' };
  return { label: `${stage.md}（文件缺失）`, kind: 'missing' };
}

/** 环节的 ref 状态：可打开 / 缺失 */
function refState(stage) {
  if (!stage.ref) return null;
  const abs = resolvePath(stage.ref);
  const ok = fs.existsSync(abs);
  return { path: stage.ref, section: stage.refSection || '', ok };
}

/** 环节类型中文名（show 输出用） */
function typeName(type) {
  const t = STAGE_TYPES[type];
  return t ? t.name : type;
}

module.exports = { listFeatures, readChain, mdState, refState, typeName };
