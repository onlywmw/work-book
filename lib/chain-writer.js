'use strict';

/**
 * chain-writer.js — 写操作（增/删/移/touch 落盘）+ 备份回滚。
 * 纪律（PLAN_BACKEND_FIRST.md v2）：
 *  - 加环节只改 chain.json，md 不落盘（A1）；落盘 = 显式 touch
 *  - 排序只改 chain.json 数组顺序，零文件操作（A2）
 *  - 删环节 md 移入 .trash/，不自动清理（P2）
 *  - 任何写操作先快照 .backup/<时间戳>/<功能id>/，失败自动回滚
 *  - chain.json 用 tmp + rename 原子替换
 */

const fs = require('fs');
const path = require('path');
const { STAGE_TYPES, isStageType } = require('./schema');
const { ROOT, FEATURES_DIR, BACKUP_DIR } = require('./registry');

function featDir(featId) {
  return path.join(FEATURES_DIR, featId);
}

function chainFile(featId) {
  return path.join(featDir(featId), 'chain.json');
}

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 整功能目录快照到 .backup/<ts>/<功能id>/，返回 ts */
function snapshot(featId) {
  const ts = nowStamp();
  const dest = path.join(BACKUP_DIR, ts, featId);
  fs.cpSync(featDir(featId), dest, { recursive: true, force: true });
  return ts;
}

/** 从快照恢复整个功能目录（先清空再拷回，删除操作也能完整回滚） */
function restoreSnapshot(ts, featId) {
  const src = path.join(BACKUP_DIR, ts, featId);
  if (!fs.existsSync(src)) throw new Error(`快照不存在: ${ts}/${featId}`);
  fs.rmSync(featDir(featId), { recursive: true, force: true });
  fs.cpSync(src, featDir(featId), { recursive: true, force: true });
}

/** chain.json 原子替换：tmp + rename */
function writeChainAtomically(featId, chain) {
  const tmp = `${chainFile(featId)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(chain, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, chainFile(featId));
}

function readChainStrict(featId) {
  const { readChain } = require('./chain-reader');
  const r = readChain(featId);
  if (r.error) throw new Error(r.error);
  return r.chain;
}

/**
 * 通用写操作外壳：快照 → 操作 → 原子写 chain.json；任一步失败自动回滚。
 * @param {string} featId
 * @param {(chain: object, ts: string) => void} op  操作体（可抛错触发回滚）
 * @param {string} what 操作名（错误消息用）
 */
function withRollback(featId, op, what) {
  const ts = snapshot(featId);
  const chain = readChainStrict(featId);
  try {
    op(chain, ts);
    writeChainAtomically(featId, chain);
    return { ok: true, ts };
  } catch (e) {
    try {
      restoreSnapshot(ts, featId);
    } catch (re) {
      return {
        ok: false,
        error: `${what}失败: ${e.message}；回滚也失败: ${re.message}（请检查文件占用后手动处理）`,
      };
    }
    return { ok: false, error: `${what}失败已回滚: ${e.message}（快照 ${ts}）` };
  }
}

/** 加环节：只改 chain.json，md 不落盘（A1）。id 稳定 = <功能id>-<type> */
function addStage(featId, type) {
  if (!isStageType(type)) {
    return { ok: false, error: `type 非法: ${type}（应为 ${Object.keys(STAGE_TYPES).join('/')}）` };
  }
  return withRollback(
    featId,
    (chain) => {
      if (chain.stages.some((s) => s.type === type)) {
        throw new Error(`「${STAGE_TYPES[type].name}」已在这条链上（链上 type 唯一）`);
      }
      chain.stages.push({ id: `${featId}-${type}`, type, status: 'wait', created: today() });
    },
    `加环节 ${type}`
  );
}

/** 落盘：创建环节 md（frontmatter id+title，正文留待编辑器写）并登记 md 字段 */
function touchStage(featId, stageId) {
  return withRollback(
    featId,
    (chain) => {
      const s = chain.stages.find((x) => x.id === stageId);
      if (!s) throw new Error(`环节不存在: ${stageId}`);
      if (s.md) throw new Error(`环节 ${stageId} 已有 md: ${s.md}（无需重复落盘）`);
      const mdRel = `stages/${s.type}.md`;
      const abs = path.join(featDir(featId), mdRel);
      if (fs.existsSync(abs)) throw new Error(`目标文件已存在: ${mdRel}（不是待生成状态）`);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const title = STAGE_TYPES[s.type].name;
      fs.writeFileSync(
        abs,
        `---\nid: ${s.id}\ntitle: ${title}\n---\n\n（正文待写——开工时由编辑器补）\n`,
        'utf8'
      );
      s.md = mdRel;
    },
    `落盘 ${stageId}`
  );
}

/** 删环节：md（若有）移入 .trash/，chain.json 移除该 stage */
function rmStage(featId, stageId) {
  return withRollback(
    featId,
    (chain) => {
      const idx = chain.stages.findIndex((x) => x.id === stageId);
      if (idx < 0) throw new Error(`环节不存在: ${stageId}`);
      const s = chain.stages[idx];
      if (s.md) {
        const src = path.join(featDir(featId), s.md);
        if (fs.existsSync(src)) {
          const trashDir = path.join(featDir(featId), '.trash');
          fs.mkdirSync(trashDir, { recursive: true });
          fs.renameSync(src, path.join(trashDir, `${s.type}-${nowStamp()}.md`));
        }
      }
      chain.stages.splice(idx, 1);
    },
    `删环节 ${stageId}`
  );
}

/** 移环节：toIndex 为 1-based 新位置（A2：零文件操作，只改数组顺序） */
function moveStage(featId, stageId, toIndex) {
  if (!Number.isInteger(toIndex) || toIndex < 1) {
    return { ok: false, error: `新位置非法: ${toIndex}（应为 ≥1 的整数）` };
  }
  return withRollback(
    featId,
    (chain) => {
      const idx = chain.stages.findIndex((x) => x.id === stageId);
      if (idx < 0) throw new Error(`环节不存在: ${stageId}`);
      if (toIndex > chain.stages.length) {
        throw new Error(`新位置越界: ${toIndex}（链长 ${chain.stages.length}）`);
      }
      const [s] = chain.stages.splice(idx, 1);
      chain.stages.splice(toIndex - 1, 0, s);
    },
    `移环节 ${stageId}`
  );
}

/** 列出快照 */
function listBackups() {
  try {
    return fs.readdirSync(BACKUP_DIR).sort().reverse();
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

/** 手动回滚某快照（覆盖 features/ 下该快照包含的全部功能目录） */
function rollback(ts) {
  const dir = path.join(BACKUP_DIR, ts);
  if (!fs.existsSync(dir)) return { ok: false, error: `快照不存在: ${ts}` };
  const ids = fs.readdirSync(dir);
  for (const id of ids) {
    restoreSnapshot(ts, id);
  }
  return { ok: true, restored: ids };
}

module.exports = { addStage, touchStage, rmStage, moveStage, listBackups, rollback, nowStamp, today };
