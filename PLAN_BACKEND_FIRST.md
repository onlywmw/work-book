# PLAN — work-book 后端先行施工计划

> 状态：**待评审 v2**（2026-08-11，P1–P4 与追加 A1–A3 已拍板并入，作者最终过目后才 commit）
> 前提：demo（work-book-demo.html）已把交互模型跑通并逐轮实测验收。
> 本计划只做一件事：**把 demo 里的模型落成真的后端**——数据是 md 文件，UI 只是 md 的投影。
> 验收纪律沿用 MOV 铁律：不信自报信实物、每里程碑独立验收、编译/运行不过不报 hash。

---

## 〇、已拍板决策（v2 并入，改动依据）

| # | 问题 | 拍板结论 |
|---|---|---|
| P1 | 环节 md 要不要 frontmatter | **最小 frontmatter（仅 id + title 关联键）**；status / 顺序 / 时间戳只存 chain.json，**绝不双写**。md 是「真身」，chain.json 是「指挥层」，chain.json 损坏时可凭 frontmatter 的 id 重建链 |
| P2 | 删环节的 md 直接删还是进 .trash/ | 移入 `features/<功能>/.trash/`；与 .backup/ 一并进 .gitignore；不自动清理，人工清 |
| P3 | demo 是否冻结作 B3 参照 | 先收档：demo + 字体收进 `work-book/demo/` 提交，再打 tag `ui-demo-v1`（B0 做） |
| P4 | 原四区视图与本模型的关系 | 四区 = **链数据的聚合视图**（B5 做），与 mirror 解绑；mirror（自动解析 TASKBOARD）无限期后置 |
| A1 | 加环节时 md 落不落盘 | **不落盘**（跟 demo）：加环节只改 chain.json，显示「待生成」；落盘走显式 `wb.js touch` 命令 |
| A2 | 排序后 md 是否随序号重命名 | **不重命名**：stages/ 文件名稳定（`<type>.md`），序号 = chain.json 数组顺序，排序零文件操作 |
| A3 | demo 摘录正文是否迁移成真 md | **不迁移**：B0 初始化时环节 md 一律「待生成」，正文开工时由编辑器写；已有真文档的环节只登记 ref 引用指向原位 |

---

## 一、demo 定稿的产品模型（本计划唯一依据）

```
项目 (work-book / MOV-APP / Yuanzi / Dify …)
  └─ 功能 (一条环节链)
       └─ 环节 (0~N 个，自由增删排序，链上 type 唯一)
            └─ md 文件 (环节的真身，一个环节一个 md)
```

模型要点（全部来自 demo 已验收的行为）：
1. **环节真身 = md 文件**。UI 里每张环节卡、每条功能主文档，背后都是一个真实 md 路径
2. **环节链自由**：不是固定七站，环节可增、可删、可拖拽排序；空链 = 未立项
3. **一个功能 = 一条自己的链**，不同功能的链长短不同（workbook 7 站、wxpay 4 站）
4. **md 未生成时诚实标注**「待生成」，不造假数据（A1/A3：默认不预建，落盘是显式动作）

**环节数据契约（chain.json 定稿字段）**：

| 字段 | 必填 | 取值 |
|---|---|---|
| `id` | ✅ | 稳定 id（CLI 生成），删了也能靠它识别；与 md frontmatter 的 id 对应 |
| `type` | ✅ | 七种枚举：`decompose / compare / plan / absorb / implement / verify / inspire`，链上唯一 |
| `status` | ✅ | 三态枚举：`wait / act / done`（UI 五词归一是显示映射，不进数据） |
| `md` | 条件 | 本地路径（`stages/<type>.md`，稳定名）；无 md = 待生成 |
| `created` | ✅ | 落盘日期（YYYY-MM-DD）；账龄 / 通知 / 滞留判定的数据源，mtime 兜底 |
| `ref` / `refSection` | 条件 | 外部文档只读引用（如 `MOV-APP/docs/DESIGN_GIG.md` + `§〇 §一`），只用于打开，不参与链正文 |

---

## 二、后端设计

### 2.1 目录约定（数据全在磁盘，没有数据库）

```
~/work-book/
├── projects.json                  # 项目元数据：id / name / tag / 仓库路径
├── features/                      # 功能列表 = 扫目录即注册，无需登记表
│   └── <功能id>/
│       ├── chain.json             # 链定义：环节顺序、类型、状态、md 映射
│       ├── stages/
│       │   ├── decompose.md       # 环节真身（稳定文件名，不带序号）
│       │   ├── compare.md
│       │   └── …                  # 一个 type 一个文件，链上 type 唯一故天然稳定
│       └── .trash/                # 被删环节的 md（.gitignore）
├── .backup/                       # 写操作前快照 <时间戳>/<功能id>/（.gitignore）
└── demo/                          # ui-demo-v1 冻结参照（html + 字体，自包含离线可开）
```

chain.json 示例：
```json
{
  "id": "gig", "name": "外卖系统（职业体系 gig）", "proj": "MOV-APP",
  "masterMd": "MOV-APP/docs/PLAN_GIG_PLATFORM_2026-08-10.md", "masterLabel": "建设计划",
  "stages": [
    {"id": "stg-1", "type": "decompose", "status": "done", "md": "stages/decompose.md", "created": "2026-08-01", "ref": "MOV-APP/docs/DESIGN_GIG.md", "refSection": "§〇 §一"},
    {"id": "stg-2", "type": "compare",   "status": "done", "md": "stages/compare.md",   "created": "2026-08-01"}
  ]
}
```

md frontmatter 约定（P1）：文件头只写 `id` + `title` 两个关联键；状态、顺序、时间戳一律读 chain.json，不双写。

### 2.2 读写边界（红线）

| 范围 | 权限 |
|---|---|
| ~/work-book/features/ 与 projects.json | **可读写**（唯一写入区） |
| ~/work-book/.backup/ .trash/ demo/ | 程序写入（.gitignore，不进 git） |
| MOV-APP / Yuanzi 等外部仓库 | **只读**。只解析、只打开，永不写入（NFR-2 延续）；通过 ref 字段引用 |
| 环节 md 未生成 | 标注「待生成」，落盘 = 显式 `touch`，不预创建空壳 |

### 2.3 后端模块（Node.js，先 CLI 直跑，后接 Electron）

| 模块 | 职责 | 对应 demo 交互 |
|---|---|---|
| registry | 读 projects.json，项目列表/切换；功能列表 = 扫 features/ | 顶栏项目按钮 |
| chain-reader | 解析 chain.json，校验 md 存在性（缺 md = 待生成，诚实不崩）；序号 = 数组位置 | 左栏功能列表 + 环节链渲染 |
| chain-writer | 见下方操作语义 | 拖拽排序、加环节卡片、拖入移除区 |
| md-open | 打开 md / masterMd / ref：CLI 用 `start ""`，Electron 用 shell.openPath | 点 md 链接 |
| mirror（后置，不承诺） | 自动解析 TASKBOARD 挂成链（P4 后无限期延后） | — |

**chain-writer 操作语义（A1/A2 定稿）**：

| 操作 | 磁盘行为 |
|---|---|
| 加环节 | **只改 chain.json**（写入 id/type/status=wait/created），md 不落盘 → 显示「待生成」 |
| 落盘 | `wb.js touch <功能> <stage-id>`：创建 md（frontmatter id+title + 空正文），更新 chain.json 的 md 字段 |
| 排序 | **只改 chain.json 数组顺序**，零文件操作，无重命名无孤儿 |
| 删环节 | md（若有）移入 .trash/，chain.json 移除该 stage；不自动清理 |
| 链约束 | type 链上唯一（demo 同款：环节池禁用已用类型） |

**chain-writer 原子性**：任何写操作先整功能目录快照到 `.backup/<时间戳>/<功能id>/`；chain.json 用 tmp + rename 原子替换（防写一半崩溃）；任一步失败 → 从快照恢复整个功能目录，可复现。

### 2.4 外部项目怎么接入（MOV-APP 等）

v1 手工登记：功能链照常建在 `features/<功能id>/`（chain.json 的 `proj` 字段标注归属），环节引用的外部文档登记为 `ref`（只读打开）。gig / market / wxpay 三条链全部照此办理，不需要 mirror。
自动解析 TASKBOARD 挂成链——不承诺，等 v1 用顺手了再说。

---

## 三、分期（每期独立可验收，数据层先于 UI）

| 期 | 内容 | 出口（验收标准） |
|---|---|---|
| **B0 数据初始化** | demo 收档 `work-book/demo/`（html + 字体）并提交；打 tag `ui-demo-v1`；落 projects.json + 5 条链 chain.json（workbook/gig/market/wxpay/wxlogin）；环节 md 一律不预建；已有真文档的环节登记 ref 指向原位 | `node wb.js list` 输出与 demo 链结构（id / 顺序 / 状态 / 类型 / ref）逐项一致；正文不比对（demo 摘录不迁移，A3） |
| **B1 数据层·读** | registry + chain-reader + CLI（`node wb.js list / show <功能>`） | 对 features/ 实测输出与 demo 数据逐项一致（链结构层面）；缺 md 报诚实「待生成」不崩 |
| **B2 数据层·写** | chain-writer：增 / 删 / 移 / touch 落盘，含备份回滚 | CLI 实测：加环节后 chain.json 变、**无新文件**（ls 对照）；touch 后 md 落盘；排序后 chain.json 顺序变、**md 文件名不变**（零重命名零孤儿）；删环节 md 进 .trash；注入失败（md 设为只读 / 编辑器占用）→ 自动回滚可复现 |
| **B3 Electron 壳** | main/preload 桥接 B1/B2，demo UI 接真数据（contextIsolation）；序号 = 数组位置，md 行显示稳定文件名 | 打开应用 = demo 的样子但数据来自真文件；改 chain.json 后刷新界面同步 |
| **B4 写入交互接通** | 界面拖拽 / 加 / 删 → 调 chain-writer → 落盘 | 界面操作后磁盘文件真实变化（截图 + ls 对照）；备份目录可回滚 |
| **B5 通知与常驻** | 托盘、定时刷新、通知；**数据源 = 环节 status + created**（非 TASKBOARD 解析）；四区 = 链数据聚合视图 | 账龄跨阈值弹 Windows 通知；dedupKey = `功能id:stage-id:事项类型:触发日期`，同事项不重弹；四区视图与 chain.json 对照一致 |

B3 之前不碰 Electron——数据层 CLI 验收不过，界面不做。

---

## 四、明确不做

1. 不引入数据库（SQLite 也不上）——md + json 就是真理源，文件可 git 可 diff
2. 不写外部仓库（MOV-APP 零改动）
3. 不做账号/云同步（单人本地）
4. v1 不做 TASKBOARD 自动解析（mirror 后置）
5. 不做构建工具链（Node 直跑 + 单文件 UI）
6. 不做自动 git commit（数据靠 .backup 快照 + 手动 git）
7. 不做 md 正文编辑器（正文用系统编辑器打开写，界面只管链结构）

---

## 五、验收方式

- 每期验收人：用户本人；验收记录落 CHANGELOG.md
- B0/B1/B2 验收 = CLI 实测输出对照 + 磁盘文件 ls 实证（不看代码自报）
- B3/B4 验收 = 界面截图 + 磁盘状态并排对照（demo/ui-demo-v1 是 UI 参照）
