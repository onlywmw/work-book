# REFERENCE — Paperclip 机制摘录（work-book 借鉴清单）

> 状态：**参考文档**（2026-08-11 v1）· 来源：paperclip-master（本地解包）
> 原则：**只摘机制，不搬系统**。Paperclip 是 server+UI 的多用户编排平台，work-book 是单机只读驾驶舱——
> 借鉴它的"注意力管理"设计思想，用轻量方式重实现，不引入它的技术栈和复杂度。
> Paperclip DESIGN.md 的产品立场（原文）：*"Every screen should answer, in order: what is happening, does it need me, what do I do about it."*（每屏按序回答：正在发生什么 / 需要我吗 / 我该怎么办）——这就是 work-book 四区视图的理论原型。

---

## 机制一：Attention Feed（注意力流）★ 最核心

**Paperclip 做法**（server/src/services/attention.ts）：
所有"需要人处理"的事统一汇入一个流，11 种来源：
approval（审批）/ decision（决策）/ join_request（加入请求）/ recovery_action（恢复动作）/ blocker_attention（阻塞）/ review / failed_run（失败运行）/ budget_alert（预算告警）/ agent_error_alert（agent 错误）……

每项带 **severity 分级**（critical / high / medium），排序规则（compareAttentionItems）：
1. 时间倒序（最新在前）
2. severity 降序（同级时间比严重度）
3. 来源类型排序
4. dedupKey 字典序兜底

**work-book 翻译**：
- 四区视图本质就是 attention feed 的分区版（等我出手=高 severity / 滞留=超时项 / 战线=进行中 / 挂账=低优先级）
- **借鉴排序规则**：滞留区不单纯按账龄排，改为「账龄 × 严重度」二级排序——比如"待验收超 5 天"比"搁置 10 天"严重（前者阻塞交付，后者是主动决策）
- 给每类任务定 severity 映射：待验收超期=high / 待认领=high / 待真机=medium / 搁置=low

## 机制二：dedupKey（去重键）——通知不骚扰的根

**Paperclip 做法**：每个 attention item 有 dedupKey，同一事项只呈现一次。

**work-book 翻译**（直接对应 FR-4）：
- 每个通知事项的 key = `任务id:事项类型:触发日期`
- 已通知过的 key 落盘 notified.json，刷新时跳过
- 这就是"账龄跨阈值只弹一次"的实现依据——不是防抖，是**事项级去重**

## 机制三：dismiss / snooze（不消失，只移位）

**Paperclip 做法**（inbox-dismissals.ts）：事项两种处理——dismiss（关闭）/ snooze（延后到指定时间），**都持久化、可查、不删除**。

**work-book 翻译**（v2 功能，v1 不做交互）：
- v1 先只记录概念：滞留项被用户"看过"（点开文档）即标记 lastViewed
- v2 可做：右键行 → 搁置 N 天（snooze），到期自动浮回。比"删掉"诚实——搁置是决策，消失是事故
- **核心思想**：任务永远不会无声消失，要么在板上，要么有明确的搁置记录

## 机制四：decision shelf life（决策保质期）

**Paperclip 做法**（decision-retention.ts）：决策默认 **30 天 shelf**、90 天归档——挂着的决策有明确生命周期，到期要么处理要么归档，不许无限挂着。

**work-book 翻译**：
- 挂账台账加"超期"概念：挂账项超过 30 天 → 标红 + 进入"该清账了"提示
- 滞留任务同理：没有"永远搁置"——搁置超 N 天应该被重新裁决（继续/砍掉/降级）
- 这直接治 MOV 的痛点：⏸️ 一挂就是永久，没人再想起

## 机制五：状态词统一（一词一义）

**Paperclip 做法**（DESIGN.md 原则 5/7）：状态（running/paused/blocked/awaiting-approval/over-budget）映射到全局唯一的状态语义，一个概念全系统一个名字（canonical term 是 task，不是 issue/ticket）。

**work-book 翻译**：
- MOV 板上状态词混乱（✅/🔨/⏸️ + 中文短语混杂），work-book 归一成五个状态词：**施工中 / 待验收 / 等我出手 / 搁置 / 待认领**——界面只显示这五个词，原文状态收进详情
- 这解决"40 处滞留标记但形态各异数不清"的问题：先归一，再统计

## 机制六：机器值等宽呈现

**Paperclip 做法**（DESIGN.md 原则 6）：ID / 成本 / token 数 / 时间戳一律等宽字体 + 统一格式化，不许每屏各自 ad hoc。

**work-book 翻译**：已采纳（账龄数字、commit hash、日期全用 Consolas 等宽）——保持。

---

## 不借鉴的（明确排除）

| Paperclip 的 | 为什么不借 |
|---|---|
| Org Chart / 预算 / 成本管控 | work-book 没有 agent 运行实体，无成本数据源 |
| 多用户 / RBAC / SSO | 单人单机 |
| 数据库（drizzle） | 文件解析 + JSON 落盘足够，不引 DB |
| Skills Store / 训练评测 | 那是 agent 管理层，work-book 只看任务 |
| 插件系统 | v1 单仓库适配器硬编码，扩展留接口不建系统 |

---

## 对 REQUIREMENTS / PLAN 的修订建议（待拍板后并入 v2）

1. **FR-3 账龄排序升级**：滞留区改「severity × 账龄」二级排序（机制一）
2. **FR-4 通知去重明确为事项级 dedupKey**，不是防抖（机制二）
3. **新增 FR-9（v2）**：snooze 搁置机制——任务不消失只移位（机制三）
4. **新增 FR-10**：挂账/搁置超期提示（30 天 shelf，机制四）
5. **UI 修订**：状态归一为五词（机制五）
6. 新增开放问题 Q7：**搁置超期天数定多少？**（Paperclip 30/90，MOV 节奏快，建议 shelf 14 天）
