'use strict';

/**
 * preload.js — 安全桥：contextIsolation 下只暴露白名单 API，无 nodeIntegration。
 * 渲染层拿不到 Node 能力，全部经 ipcRenderer.invoke 走主进程校验。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wb', {
  root: () => ipcRenderer.invoke('wb:root'),
  listProjects: () => ipcRenderer.invoke('wb:listProjects'),
  listFeatures: () => ipcRenderer.invoke('wb:listFeatures'),
  showFeature: (id) => ipcRenderer.invoke('wb:showFeature', id),
  readStageMd: (id, sid) => ipcRenderer.invoke('wb:readStageMd', id, sid),
  open: (target) => ipcRenderer.invoke('wb:open', target),
  addStage: (id, type) => ipcRenderer.invoke('wb:addStage', id, type),
  touchStage: (id, sid) => ipcRenderer.invoke('wb:touchStage', id, sid),
  rmStage: (id, sid) => ipcRenderer.invoke('wb:rmStage', id, sid),
  moveStage: (id, sid, toIndex) => ipcRenderer.invoke('wb:moveStage', id, sid, toIndex),
});
