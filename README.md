# Jev Tetris Lab

由 AI 选择合法落点、本地执行路径的俄罗斯方块实验工具。React + TypeScript + Vite + Tailwind / Canvas，Node.js + Express + Zod / SQLite。默认无需密钥即可运行。本工具不保证最优落点或无限生存。

界面采用星空主题：动态星点、星云、稀疏流星、轨道行星、半透明面板和方块落地光波。右上角星光按钮可以切换静谧模式，偏好保存在本机；系统“减少动态效果”优先，装饰动画不影响游戏规则或模型请求节奏。背景 Canvas 限制为 30fps，并在页面隐藏时停止绘制。

## 启动

需要 Node.js **22.13+（建议 24 LTS）**，使用 Node 内置 `node:sqlite`，无需安装数据库服务。

```sh
npm install
npm run dev
```

打开 **http://127.0.0.1:5174**。后端监听 `127.0.0.1:3001`，Vite 将 `/api` 代理到后端。前端端口固定并启用 strictPort，不会悄悄跳到别的端口。已有其他服务占用端口时，请先调整本项目配置及后端 Origin 白名单。

生产构建及本机运行：

```sh
npm run build
npm start
```

打开 **http://127.0.0.1:3001**，Express 同时提供前端构建和 API。`npm run build` 包括全仓 TypeScript 检查、Vite 构建和后端 TypeScript 编译。

## 第一次使用

1. 默认“模拟演示”，点击“开始实验”持续运行，或“单步执行”只完成一个方块的决策与落地。
2. “模型供应商” → “添加供应商”，选择接口协议，输入完整 URL、密钥和模型 ID。
3. 点击“测试连接”。这会由后端发送包含两个候选和三个问题的实际小型决策请求，可能收费；连接测试不重试。保存前也可以测试。
4. 保存后点击“设为当前”，关闭管理窗口，在“控制模式”选择“真实 AI”。点击继续实验。没有真实密钥时可添加“本地模拟”协议，验证相同的服务端请求闭环；结果始终标为 Mock。
5. 在候选页查看模型概率、执行方案及本地评分；悬停候选时棋盘显示明确标记的决策快照。历史记录点击后显示“历史快照”，不会冒充当前局面。

供应商显示名称只是标签。接口协议、模型 ID 与完整 endpoint 均独立保存。一个配置代表一个协议 / endpoint / 模型组合；同供应商多模型可复制配置再修改模型 ID，复制不携带密钥。支持启用、禁用、删除、编辑及设为当前。非敏感配置与当前供应商保存在 SQLite，刷新和重启均保留。个人实验设置只将非敏感数值保存在 localStorage。

### 协议预设

| 协议                 | 完整 POST 地址                              | 模型示例               |
| -------------------- | ------------------------------------------- | ---------------------- |
| OpenRouter Decisions | `https://openrouter.ai/api/alpha/decisions` | `typesafe/jev-1.13`    |
| TypeSafe System One  | `https://api.typesafe.ai/v1/systemone`      | `jev-latest`（可编辑） |
| 本地模拟             | 无需 URL                                    | `heuristic-mock`       |

地址不追加 `/v1` 或其他路径。兼容服务可输入自定义 HTTPS 地址。OpenAI Chat Completions、Anthropic Messages 预留了适配器边界，表单中禁用，不能保存为可用协议。它们不是 Decisions 协议的别名。

TypeSafe 请求和答案结构已依据[官方快速入门](https://docs.typesafe.ai/introduction/quickstart)核对。OpenRouter alpha 地址与模型使用需求中提供的可编辑契约预设，未声称已发现或验证“最新模型”。没有真实 API Key，**未完成两个远端服务的真实收费联网调用验证**。可使用连接测试检查自己的账号、模型和 endpoint。

## 游戏规则与可复现性

- 可见棋盘 10 列 × 20 行，没有隐藏出生行。`board[y][x]`，行向下，列向右，坐标从 0 开始。0 为空；1～7 对应 I/O/T/S/Z/J/L。棋盘只含已锁定格子。
- 当前方块单独提供。I 使用 4×4 矩阵，O 使用 2×2，其余使用 3×3；绕矩阵中心顺/逆时针旋转。按 `0, -1, +1, -2, +2` 顺序尝试水平墙踢，没有竖直墙踢。出生 y=0，O 的 x=4，其余 x=3。所有占用格必须位于可见棋盘内。
- 软降或重力向下一格失败即锁定，无额外锁定延迟；硬降移动到底并立即锁定。出生碰撞即结束。消行同时发生，顶部补空行。
- 使用 32 位 LCG（1664525 / 1013904223）驱动 Fisher–Yates 的 7-bag。相同种子和相同动作序列可复现棋盘。真实模型选择本身不保证确定性。
- 单次消除 1/2/3/4 行分别得 100/300/500/800 × 本次锁定前等级。等级 = `1 + floor(累计消行 / 10)`；移动与软/硬降不额外计分。
- 手动重力每 `max(100, 800 - floor(lines/10)*60)` ms 下落一格。←/→ 移动，↑ 顺旋，Z 逆旋，↓ 软降，空格硬降；手机可用操作按钮。
- AI 模式为决策回合制：等待网络时不推进重力。播放 1x/2x/4x 只改变路径展示与回合间动画；不加速网络。存活时间统计运行中的墙钟秒数，包含 AI 等待、排除暂停。
- 本实现为明确的简化规则，**不声称符合全部官方竞技规则**。未实现 Hold、T-Spin 特殊计分、复杂连击或官方 SRS。

## 候选、指标与本地策略

`shared/game/engine.ts` 是纯函数规则；`candidates.ts` 用 BFS 遍历从当前姿态可达的平移、旋转和下落状态，每个状态尝试硬降；按最终占用格去重并保存动作路径。搜索与执行共用 `move` 和 `lock`，不会随意拼接列与旋转。

指标均由程序在模拟锁定、消行后计算：

- `clearedLines`：本方案消行数。
- `maxHeight`：各列高度最大值；空列为 0，非空列为 20 减最高占用行号。
- `aggregateHeight`：十列高度之和。
- `holes`：各列最高占用格下面的空格数量。
- `bumpiness`：相邻列高度差绝对值之和。
- `topOut`：锁定无效，或消行后已知下一块无法出生。

固定启发式分数：`10*消行 - 7*洞 - 0.5*总高度 - 0.35*凹凸 - 0.8*最大高度 - 10000*顶部溢出`。设置中公开这些权重，首版权重固定，不是训练出的最优参数。默认提交 24 个候选，可调；保留一半高分候选，再补充不同 x / rotation 组合，剩余按分数补齐。控制台显示总数、提交数及是否筛选。所有候选仍可查看。

Mock 使用启发式最佳方案，并以温度 3 的 softmax 构造明确标为**模拟值**的分布；本地策略模式不提供概率。模拟故障可设置错误或超时，用于验证兜底 / 暂停。

## Jev 数据契约

共享类型在 `shared/types.ts`，Zod 校验在 `shared/schemas.ts` 与 `shared/decisions.ts`。

```ts
{
  model: (provider.modelId, state, questions);
}
```

- **state**：sessionId、stateVersion、pieceId、锁定棋盘、当前方块、下一块、当前指标，以及已经计算好 `after` 指标和动作路径的候选。
- **questions**：明确带 `type` 的独立问题。`placement: choice` 选择一个完整候选 ID；`board_risk: noul` 问当前局面是否需要保守处理；`board_quality: score` 评价当前棋盘。
- **criteria**：choice 中为 ID → 候选指标说明；noul 中为 true / false 的说明；score 中为 5 级有序描述。
- **answers**：读取 `answers.placement.choice / probabilities / confidence`、`answers.board_risk.noul` 和 `answers.board_quality.score`。只让 placement 控制执行。问题不会假定能看到其他问题的答案。

答案必须带匹配的 `type`。choice 概率键集合必须与提交候选完全一致，每项有限且在 [0,1]，总和允许 0.001 误差。noul 在 [0,1]；score 为 **[0,4]**，允许小数。若返回 score 概率，验证五个级别及分布总和。confidence 可缺省，不伪造；它不是“正确率”。noul 是回答“是”的模型概率，不是实际游戏失败概率。未返回 usage、cost、confidence 时显示“未提供”。

请求页提供实际 state、questions（含 criteria）、脱敏原始响应、标准化结果与实际动作结果。格式错误的 JSON 响应同样会脱敏保存用于排查。UI 的“本地指标说明”只陈述计算结果，不编造模型解释或隐藏推理。

## 请求生命周期、失败处理与费用节制

同一会话至多一个有效请求。事件驱动启动循环，React StrictMode 的 effect 不自动发请求。`requestId + sessionId + pieceId + stateVersion + configVersion` 和本地 epoch 一起防止过期结果执行。暂停、重新开始、模式/供应商/模型切换、卸载都会取消或使结果失效；后端配置变更也会中止进行中的决策。切换保留棋盘，继续时从当前姿态重新 BFS。

默认最小主要请求间隔 2000ms、本局 100 次主要调用上限、连续 3 次失败停止远端调用。间隔与上限不随播放速度缩短。默认零重试，配置可设 0～3 次；仅 408、429、5xx 重试，遵循有上限的 Retry-After / 退避。认证、余额、格式类错误不自动反复请求。后端主要决策另设每分钟 60 次限制；一次主要请求内的重试、供应商连接测试不计入前端主要调用计数。

失败可以选择本地启发式兜底，或暂停；错误原因和来源明确保留。达到连续失败阈值后请修复/切换配置，或重新开始。上限触发后需要重新开始新局。没有合法候选时结束，不发送空请求。历史保留本局最近 100 次决策，记录各次实际供应商 / 模型、快照、结果、路径、耗时、消行、兜底与错误；刷新或重新开始会清空本局历史，不写入数据库。

## 密钥与运行范围

将 `.env.example` 复制为 `.env`。密钥由网页输入后仅交给本项目后端，不存入 localStorage / IndexedDB，不从查询 API 返回。首次输入可以显隐，编辑留空保留原密钥；清除是独立选项。掩码不会被填进输入框或作为真实凭据提交。

持久化密钥需要后端 `MASTER_KEY`（32 字节 Base64）：

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

把生成值放到后端环境变量或 `.env`，不要提交版本控制。密钥采用 AES-256-GCM，每次随机 nonce，以 providerId 为 AAD；主密钥与 SQLite 分开。缺失 MASTER_KEY 时，配置仍持久化，但 API Key 仅在后端内存保存，界面明确提示重启后重新输入；没有明文落盘回退。已有密文不能在错误主密钥下使用，需恢复正确主密钥或清除并重新输入。`.env`、`data/`、日志、构建缓存均已忽略。

自定义 endpoint 只允许无用户名密码、无 query/fragment、443 端口的 HTTPS URL。服务端在请求前解析 DNS，拒绝任何私有、回环、链路本地、保留地址（含映射 IPv6），并将连接固定到已检查地址，禁止跟随重定向；响应上限 2MB。认证头与已知密钥会递归脱敏，不记录外部请求头。连接测试凭据只在请求生命周期内使用，临时测试收据只保存不可逆配置指纹。

**运行范围是本机单用户。** Express 固定绑定 127.0.0.1，检查 Host、Origin 和自定义同源请求头。不提供公网登录系统。若经代理开放公网，必须先加身份认证、细粒度限流和严格 Origin 策略；不要直接暴露本地 API 或 Vite 开发服务。

## 文件边界

```text
shared/game/         纯函数游戏规则、BFS、指标、固定启发式
shared/             游戏/供应商/决策类型与运行时契约
backend/src/adapters 独立协议适配器及 Mock
backend/src/services SQLite、认证加密、HTTPS / DNS 安全传输
backend/src/app.ts   供应商 CRUD、实际连接测试、决策接口
frontend/src/hooks  取消、身份校验、重力与决策执行循环
frontend/src/providers 可视化供应商管理与表单
frontend/src/components Canvas、AI 面板、候选、历史、JSON、无障碍弹窗
tests/              游戏、契约、HTTP、持久化与 React 异步测试
```

## 测试与实现范围

```sh
npm test
npm run build
npm audit
```

实际验证记录见 [docs/VERIFICATION.md](docs/VERIFICATION.md)。HTTP 契约测试使用注入的假传输，真实路由、校验、加密和 SQLite 逻辑均实际执行；不需要 API Key。

已实现：全部基础游戏规则、四种控制模式、可达落点与动画执行、两种真实协议的后端适配、可视化供应商 CRUD/测试、密钥管理、来源明确的反馈面板、候选概率、历史快照、取消/限额/兜底、响应式布局、原生 dialog 焦点约束与 Escape、减少动画设置。

未实现：OpenAI/Anthropic 聊天适配、Hold、T-Spin 特殊规则、官方竞技旋转系统、多用户账号 / 公网部署认证、长期历史数据库、模型列表自动发现、计费估算。未验证真实账户远端调用；无此条件时不会把契约测试说成真实服务联调通过。
