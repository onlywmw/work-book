'use strict';

/**
 * md-open.js — 打开文档。CLI 用 start ""（Windows）；Electron 用 shell.openPath。
 */

const { exec } = require('child_process');
const fs = require('fs');
const { resolvePath } = require('./registry');

/** 打开本地路径；返回 { ok } 或 { ok:false, error } */
function openPath(p) {
  const abs = resolvePath(p);
  if (!fs.existsSync(abs)) return { ok: false, error: `文件不存在: ${p}` };
  return new Promise((resolve) => {
    exec(`start "" "${abs}"`, { windowsHide: true }, (err) => {
      if (err) resolve({ ok: false, error: err.message });
      else resolve({ ok: true });
    });
  });
}

module.exports = { openPath };
