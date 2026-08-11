'use strict';

/**
 * wb.js — work-book 数据层 CLI（B1 读 / B2 写）
 *
 *   node wb.js list [项目id]                功能总览（无参数 = 全部项目）
 *   node wb.js show <功能id>                功能详情 + 环节链
 *   node wb.js add <功能id> <type>          加环节（只改 chain.json，md 待生成）
 *   node wb.js touch <功能id> <stage-id>    落盘环节 md
 *   node wb.js rm <功能id> <stage-id>       删环节（md 进 .trash/）
 *   node wb.js move <功能id> <stage-id> <新位置>   排序（1-based，零文件操作）
 *   node wb.js open <功能id> [stage-id]     打开主文档 / 环节 md / ref
 *   node wb.js backups                      列出快照
 *   node wb.js rollback <时间戳>            从快照恢复
 *
 * 纪律：诚实错误（stderr + exit 1），不崩不造假。
 */

const { loadProjects } = require('./lib/registry');
const { listFeatures, readChain, mdState, refState, typeName } = require('./lib/chain-reader');
const { STAGE_TYPES } = require('./lib/schema');
const { openPath } = require('./lib/md-open');

const STATUS_WORD = { wait: '未开始', act: '进行中', done: '完成' };

/** 惰性加载写层（B1 读层 commit 不含 chain-writer.js 也能跑） */
function writer() {
  return require('./lib/chain-writer');
}

function fail(msg) {
  console.error(`错误: ${msg}`);
  process.exitCode = 1;
}

function usage() {
  console.log(
    [
      'work-book 数据层 CLI',
      '',
      '  node wb.js list [项目id]                功能总览',
      '  node wb.js show <功能id>                功能详情 + 环节链',
      '  node wb.js add <功能id> <type>          加环节（md 待生成）',
      '  node wb.js touch <功能id> <stage-id>    落盘环节 md',
      '  node wb.js rm <功能id> <stage-id>       删环节（md 进 .trash/）',
      '  node wb.js move <功能id> <stage-id> <新位置>   排序（1-based）',
      '  node wb.js open <功能id> [stage-id]     打开主文档 / 环节 md / ref',
      '  node wb.js backups                      列出快照',
      '  node wb.js rollback <时间戳>            从快照恢复',
    ].join('\n')
  );
}

function cmdList(arg) {
  const { projects, error } = loadProjects();
  if (error) return fail(error);
  const { features, errors } = listFeatures();
  const proj = arg ? projects.find((p) => p.id === arg) : null;
  if (arg && !proj) return fail(`项目不存在: ${arg}`);
  const shown = proj ? projects.filter((p) => p.id === proj.id) : projects;
  console.log('项目:');
  for (const p of shown) {
    const mark = p.present ? '' : ' · 未检出';
    console.log(`  ${p.id.padEnd(9)} ${p.name}（${p.tag}）${mark}`);
  }
  const feats = proj ? features.filter((f) => f.proj === proj.id) : features;
  console.log(`\n功能 (${feats.length}):`);
  if (!feats.length) {
    console.log('  （空 —— 这个项目还没有功能链）');
  }
  for (const f of feats) {
    const master = f.masterMd ? `${f.masterLabel || '主文档'} · ${f.masterMd}` : '未立项';
    console.log(`  ${f.id.padEnd(9)} ${f.name}  [${f.proj}]  ${f.stages.length} 环节  ${master}`);
  }
  for (const e of errors) console.error(`警告: ${e}`);
}

function stageLine(i, s, featId) {
  const md = mdState(s, featId);
  const ref = refState(s);
  const no = String(i + 1).padStart(2, '0');
  const mdPart = md.label;
  const refPart = ref ? `${ref.ok ? 'ref:' : 'ref 缺失:'} ${ref.path}${ref.section ? ' ' + ref.section : ''}` : '';
  return `  ${no}  ${s.type.padEnd(10)} ${typeName(s.type).padEnd(9)} ${STATUS_WORD[s.status].padEnd(4)} ${mdPart}${refPart ? '  ' + refPart : ''}`;
}

function cmdShow(featId) {
  const r = readChain(featId);
  if (r.error) return fail(`features/${featId}/chain.json: ${r.error}`);
  const f = r.chain;
  const master = f.masterMd ? `${f.masterLabel || '主文档'} · ${f.masterMd}` : '未立项 · 无主文档';
  console.log(`功能: ${f.name}  [${f.proj}]`);
  console.log(`主文档: ${master}`);
  console.log(`链 (${f.stages.length} 环节):`);
  if (!f.stages.length) {
    console.log('  （空链 = 未立项）');
    return;
  }
  for (let i = 0; i < f.stages.length; i++) {
    console.log(stageLine(i, f.stages[i], featId));
  }
}

function cmdAdd(featId, type) {
  const r = writer().addStage(featId, type);
  if (!r.ok) return fail(r.error);
  const chain = readChain(featId).chain;
  const s = chain.stages[chain.stages.length - 1];
  console.log(`已加环节「${STAGE_TYPES[type].name}」（${s.id}，status=wait）—— md 待生成，落盘用: node wb.js touch ${featId} ${s.id}`);
  console.log(`快照: .backup/${r.ts}/${featId}`);
}

function cmdTouch(featId, stageId) {
  const r = writer().touchStage(featId, stageId);
  if (!r.ok) return fail(r.error);
  const chain = readChain(featId).chain;
  const s = chain.stages.find((x) => x.id === stageId);
  console.log(`已落盘: features/${featId}/${s.md}`);
  console.log(`快照: .backup/${r.ts}/${featId}`);
}

function cmdRm(featId, stageId) {
  const r = writer().rmStage(featId, stageId);
  if (!r.ok) return fail(r.error);
  console.log(`已删环节 ${stageId}（md 若有已移入 .trash/，不自动清理）`);
  console.log(`快照: .backup/${r.ts}/${featId}`);
}

function cmdMove(featId, stageId, toIndex) {
  const n = Number(toIndex);
  if (!Number.isInteger(n)) return fail(`新位置非法: ${toIndex}`);
  const r = writer().moveStage(featId, stageId, n);
  if (!r.ok) return fail(r.error);
  const chain = readChain(featId).chain;
  const order = chain.stages.map((s, i) => `${i + 1}.${s.id}`).join(' ');
  console.log(`已排序: ${order}`);
  console.log(`快照: .backup/${r.ts}/${featId}`);
}

async function cmdOpen(featId, stageId) {
  const r = readChain(featId);
  if (r.error) return fail(r.error);
  const f = r.chain;
  let target = null;
  let desc = '';
  if (!stageId) {
    if (!f.masterMd) return fail(`功能 ${featId} 无主文档`);
    target = f.masterMd;
    desc = '主文档';
  } else {
    const s = f.stages.find((x) => x.id === stageId);
    if (!s) return fail(`环节不存在: ${stageId}`);
    if (s.md) {
      target = s.md;
      desc = `环节 ${s.id} md`;
    } else if (s.ref) {
      target = s.ref;
      desc = `环节 ${s.id} ref${s.refSection ? ' ' + s.refSection : ''}`;
    } else {
      return fail(`环节 ${s.id} 无 md（待生成）也无 ref`);
    }
  }
  const res = await openPath(target);
  if (!res.ok) return fail(res.error);
  console.log(`已打开${desc}: ${target}`);
}

function cmdBackups() {
  const list = writer().listBackups();
  if (!list.length) {
    console.log('（无快照 —— 还没有写操作）');
    return;
  }
  console.log('快照:');
  for (const ts of list) console.log(`  ${ts}`);
}

function cmdRollback(ts) {
  const r = writer().rollback(ts);
  if (!r.ok) return fail(r.error);
  console.log(`已从快照 ${ts} 恢复: ${r.restored.join(', ')}`);
}

async function main() {
  const [cmd, a, b, c] = process.argv.slice(2);
  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      usage();
      break;
    case 'list':
      cmdList(a);
      break;
    case 'show':
      if (!a) return fail('用法: node wb.js show <功能id>');
      cmdShow(a);
      break;
    case 'add':
      if (!a || !b) return fail('用法: node wb.js add <功能id> <type>');
      cmdAdd(a, b);
      break;
    case 'touch':
      if (!a || !b) return fail('用法: node wb.js touch <功能id> <stage-id>');
      cmdTouch(a, b);
      break;
    case 'rm':
      if (!a || !b) return fail('用法: node wb.js rm <功能id> <stage-id>');
      cmdRm(a, b);
      break;
    case 'move':
      if (!a || !b || !c) return fail('用法: node wb.js move <功能id> <stage-id> <新位置>');
      cmdMove(a, b, c);
      break;
    case 'open':
      if (!a) return fail('用法: node wb.js open <功能id> [stage-id]');
      await cmdOpen(a, b);
      break;
    case 'backups':
      cmdBackups();
      break;
    case 'rollback':
      if (!a) return fail('用法: node wb.js rollback <时间戳>');
      cmdRollback(a);
      break;
    default:
      fail(`未知命令: ${cmd}`);
      usage();
  }
}

main().catch((e) => fail(e.stack || e.message));
