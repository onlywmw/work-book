'use strict';

/**
 * schema.js — chain.json 数据契约（PLAN_BACKEND_FIRST.md v2 定稿）
 * 枚举、校验、默认值。所有校验失败只收集错误，不抛异常。
 */

const STAGE_TYPES = {
  decompose: { name: '目标拆解' },
  compare: { name: '对比' },
  plan: { name: '得出计划和验收标准' },
  absorb: { name: '吸收' },
  implement: { name: '实施' },
  verify: { name: '查验' },
  inspire: { name: '灵感' },
};

const STAGE_STATUS = ['wait', 'act', 'done'];

/** 稳定文件名契约（A2）：stages/<type>.md，一个 type 一个文件，链上 type 唯一 */
const STAGE_MD_RE = /^stages\/[a-z]+\.md$/;

function isStageType(t) {
  return Object.prototype.hasOwnProperty.call(STAGE_TYPES, t);
}

/**
 * 校验整条链。返回错误数组；空数组 = 合法。
 * @param {object} chain
 * @returns {string[]}
 */
function validateChain(chain) {
  const errs = [];
  if (!chain || typeof chain !== 'object') return ['chain.json 不是对象'];
  if (!chain.id || typeof chain.id !== 'string') errs.push('缺少 id');
  if (!chain.name || typeof chain.name !== 'string') errs.push('缺少 name');
  if (!chain.proj || typeof chain.proj !== 'string') errs.push('缺少 proj');
  if (!Array.isArray(chain.stages)) {
    errs.push('stages 必须是数组');
    return errs;
  }
  const seenType = new Set();
  const seenId = new Set();
  chain.stages.forEach((s, i) => {
    const at = `stages[${i}]`;
    if (!s || typeof s !== 'object') {
      errs.push(`${at} 不是对象`);
      return;
    }
    if (!s.id || typeof s.id !== 'string') errs.push(`${at} 缺少 id`);
    else if (seenId.has(s.id)) errs.push(`${at} id 重复: ${s.id}`);
    else seenId.add(s.id);
    if (!isStageType(s.type)) errs.push(`${at} type 非法: ${s.type}（应为 ${Object.keys(STAGE_TYPES).join('/')}）`);
    else if (seenType.has(s.type)) errs.push(`${at} type 重复: ${s.type}（链上 type 唯一）`);
    else seenType.add(s.type);
    if (!STAGE_STATUS.includes(s.status)) errs.push(`${at} status 非法: ${s.status}（应为 ${STAGE_STATUS.join('/')}）`);
    if (s.created && !/^\d{4}-\d{2}-\d{2}$/.test(s.created)) errs.push(`${at} created 格式非法: ${s.created}（应为 YYYY-MM-DD）`);
    if (s.md !== undefined && !STAGE_MD_RE.test(s.md)) errs.push(`${at} md 非法: ${s.md}（应为稳定名 stages/<type>.md）`);
  });
  return errs;
}

module.exports = { STAGE_TYPES, STAGE_STATUS, STAGE_MD_RE, isStageType, validateChain };
