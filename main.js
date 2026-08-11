'use strict';

/**
 * main.js — Electron 主进程（B3/B4）
 * 纪律：contextIsolation + preload 桥，数据层复用 lib/（CLI 与界面同源）；
 * 写操作全部走 chain-writer（快照回滚），界面不直接碰文件。
 * `--smoke` 参数：加载完成后跑数据层自检并退出（自测用，不弹窗常驻）。
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { loadProjects, ROOT } = require('./lib/registry');
const { listFeatures, readChain, mdState, refState } = require('./lib/chain-reader');
const writer = require('./lib/chain-writer');

const SMOKE = process.argv.includes('--smoke');

/** 链 → UI 视图（序号 = 数组位置；md 稳定名；ref 只读引用） */
function featureView(chain) {
  return {
    id: chain.id,
    name: chain.name,
    proj: chain.proj,
    masterMd: chain.masterMd,
    masterLabel: chain.masterLabel,
    stages: chain.stages.map((s, i) => {
      const md = mdState(s, chain.id);
      const ref = refState(s);
      return {
        id: s.id,
        type: s.type,
        status: s.status,
        created: s.created,
        no: i + 1,
        mdLabel: md.label,
        mdKind: md.kind,
        ref: ref ? { path: ref.path, section: ref.section, ok: ref.ok } : null,
      };
    }),
  };
}

/** 环节 md 正文（详情面板用）；pending = 诚实待生成 */
function readStageMd(featId, stageId) {
  const r = readChain(featId);
  if (r.error) return { error: r.error };
  const s = r.chain.stages.find((x) => x.id === stageId);
  if (!s) return { error: `环节不存在: ${stageId}` };
  if (!s.md) return { kind: 'pending' };
  const abs = path.join(ROOT, 'features', featId, s.md);
  if (!fs.existsSync(abs)) return { kind: 'missing' };
  return { kind: 'real', text: fs.readFileSync(abs, 'utf8') };
}

/** 写操作结果 → { ok, chain } 或 { error } */
function stageOpResult(featId, res) {
  if (!res.ok) return { error: res.error };
  const r = readChain(featId);
  if (r.error) return { error: r.error };
  return { ok: true, chain: featureView(r.chain), ts: res.ts };
}

function registerIpc() {
  ipcMain.handle('wb:root', () => ROOT);
  ipcMain.handle('wb:listProjects', () => loadProjects());
  ipcMain.handle('wb:listFeatures', () => listFeatures());
  ipcMain.handle('wb:showFeature', (_e, featId) => {
    const r = readChain(featId);
    return r.error ? { error: r.error } : featureView(r.chain);
  });
  ipcMain.handle('wb:readStageMd', (_e, featId, stageId) => readStageMd(featId, stageId));
  ipcMain.handle('wb:open', async (_e, target) => {
    const abs = path.resolve(ROOT, target);
    const err = await shell.openPath(abs);
    return err ? { ok: false, error: err } : { ok: true };
  });
  ipcMain.handle('wb:addStage', (_e, featId, type) => stageOpResult(featId, writer.addStage(featId, type)));
  ipcMain.handle('wb:touchStage', (_e, featId, stageId) => stageOpResult(featId, writer.touchStage(featId, stageId)));
  ipcMain.handle('wb:rmStage', (_e, featId, stageId) => stageOpResult(featId, writer.rmStage(featId, stageId)));
  ipcMain.handle('wb:moveStage', (_e, featId, stageId, toIndex) => stageOpResult(featId, writer.moveStage(featId, stageId, toIndex)));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: '#FAFBF7',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.loadFile('index.html');
  return win;
}

app.whenReady().then(() => {
  registerIpc();
  const win = createWindow();
  if (SMOKE) {
    win.webContents.once('did-finish-load', async () => {
      const p = loadProjects();
      const f = listFeatures();
      const problems = (p.error ? 1 : 0) + f.errors.length;
      console.log(
        `[smoke] projects=${p.projects ? p.projects.length : 0} features=${f.features.length} warnings=${f.errors.length} loadErr=${p.error || 'none'}`
      );
      console.log(`[smoke] ${problems === 0 ? 'OK' : 'CHECK — 见上方 warnings'}`);
      // 渲染进程桥自检：wxlogin 空链 add→move→rm 往返，最终恢复空链无残留
      const ui = await win.webContents.executeJavaScript(
        `(async () => {
          const lf = await window.wb.listFeatures();
          const add = await window.wb.addStage('wxlogin', 'decompose');
          const mv = add.ok ? await window.wb.moveStage('wxlogin', 'wxlogin-decompose', 1) : null;
          const rm = add.ok ? await window.wb.rmStage('wxlogin', 'wxlogin-decompose') : null;
          const rd = await window.wb.readStageMd('gig', 'gig-d');
          return JSON.stringify({
            features: lf.features.length,
            addOk: !!add.ok,
            mvOk: mv && !!mv.ok,
            rmOk: rm && !!rm.ok,
            finalStages: rm ? rm.chain.stages.length : -1,
            readMd: rd.kind
          });
        })()`
      );
      console.log(`[smoke-ui] ${ui}`);
      app.quit();
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
