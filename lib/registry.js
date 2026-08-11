'use strict';

/**
 * registry.js — 项目注册表（projects.json）
 * 功能列表 = 扫 features/ 目录即注册，不在此文件里。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROJECTS_FILE = path.join(ROOT, 'projects.json');
const FEATURES_DIR = path.join(ROOT, 'features');
const BACKUP_DIR = path.join(ROOT, '.backup');

/** 解析相对 work-book 根的路径（masterMd / ref / md 的统一基准） */
function resolvePath(p) {
  return path.resolve(ROOT, p);
}

function loadProjects() {
  let raw;
  try {
    raw = fs.readFileSync(PROJECTS_FILE, 'utf8');
  } catch (e) {
    return { error: `projects.json 读取失败: ${e.message}` };
  }
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.projects)) return { error: 'projects.json 缺少 projects 数组' };
    return {
      projects: data.projects.map((p) => {
        const abs = p.repo ? path.resolve(ROOT, p.repo) : null;
        return {
          id: p.id,
          name: p.name,
          tag: p.tag || '',
          repo: p.repo,
          repoAbs: abs,
          present: abs ? fs.existsSync(abs) : false,
        };
      }),
    };
  } catch (e) {
    return { error: `projects.json 解析失败: ${e.message}` };
  }
}

function getProject(id) {
  const { projects, error } = loadProjects();
  if (error) return null;
  return projects.find((p) => p.id === id) || null;
}

module.exports = { ROOT, PROJECTS_FILE, FEATURES_DIR, BACKUP_DIR, resolvePath, loadProjects, getProject };
