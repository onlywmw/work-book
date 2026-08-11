# CHANGELOG — work-book 验收记录

> 纪律：不信自报信实物 · 每里程碑独立验收 · 验收人：用户本人
> 格式：每次验收/施工补一行，标注日期与证据。

## 2026-08-11 · 验收

- B0 / B1 / B2 用户实测放行（实测 CLI 操作：add/touch/rm 在真实链 wxlogin/workbook 上执行并有 .backup 快照痕迹；无问题反馈），进入 B3/B4

## 2026-08-11 · 施工记录（待验收）

- B3/B4：Electron 壳 + 界面写交互（main.js/preload.js/index.html，contextIsolation；demo 样式迁移；拖拽排序/加环节/删环节 → chain-writer 落盘；`npm start` 启动，`npm run smoke` 自检）

- B0 数据初始化落盘：projects.json + 5 条链 chain.json（workbook/gig/market/wxpay/wxlogin），环节 md 一律待生成，真文档环节登记 ref；demo 收档 `demo/`（html + 字体自包含），tag `ui-demo-v1`
- B1 数据层·读：`node wb.js list / show / open`（registry + chain-reader + md-open）
- B2 数据层·写：`node wb.js add / touch / rm / move / backups / rollback`（快照回滚 + chain.json 原子写）
- 施工方自测（临时功能 `_test`，测完已删）：读层输出对照 demo 逐项一致；add 重复 type 拒绝；touch 失败注入自动回滚；rm 移 .trash；rollback 恢复可复现
