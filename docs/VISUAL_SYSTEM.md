# Jev AI Lab 视觉系统

本次实现为梦幻粉紫观测站，真实 3D 只负责呈现。规则、请求、预算、存储不依赖动画。

## 原色与语义

原色来自 [tale-loom DESIGN.md](https://github.com/WXH666-bit/tale-loom/blob/main/DESIGN.md)。实验语义映射是 Jev AI Lab 的设计。

| Token            | HEX     | 用途                 |
| ---------------- | ------- | -------------------- |
| sky-start        | #0f0c29 | 深空、内嵌屏幕       |
| sky-middle       | #302b63 | 星云、深紫合金       |
| sky-end          | #24243e | 空间背景尾色         |
| accent-primary   | #f093fb | 品牌、核心、选中候选 |
| accent-danger    | #f5576c | 实际错误             |
| accent-info      | #4facfe | 冷色轮廓光           |
| accent-success   | #43e97b | 连接和成功           |
| accent-peach     | #fa709a | 局部暖反射           |
| accent-highlight | #fee140 | 刻度与等待提示       |
| accent-mint      | #a8edea | 实际路径、清透反射   |
| accent-lavender  | #e0c3fc | 珠光壳体、标题和高光 |
| text-secondary   | #c2e9fb | 次要文字基色         |

CSS token 位于 `frontend/src/spatial.css`；WebGL/Canvas 共享原色、材质及质量预算位于 `frontend/src/visual/tokens.ts`。

派生集中定义：正文 ink = 75% lavender + 25% secondary；muted = 72% secondary + 28% sky-middle；metal = 70% sky-middle + 30% sky-start；screen = 88% sky-start + 12% sky-middle；描边为 lavender 15% / 30%；粉色环境光为 primary 13%。避免在模块里各自发明另一套科技蓝。

正文与数值保持正面，不进入 WebGL 后期处理。在浏览器读取最终正文/次要文字色，与最亮的大面积 metal 面板底色计算 WCAG 相对亮度对比，分别约 **9.81:1 / 6.85:1**。这不是对所有装饰、禁用控件和渐变像素的全站自动审计。

## 三类材质

- 珠光玻璃：`MeshPhysicalMaterial`，clearcoat 1、iridescence 0.65、thickness 0.65、IOR 1.35；增强/影院使用局部透射，目标分辨率为视口一半。标准档保留半透明轮廓但关闭透射。
- 深紫合金：metalness 0.72、roughness 0.28；实体支架和扫描底座使用相同材质。RoundedBoxGeometry 提供真实倒角。
- 全息能量：粉紫自发光核心、薄荷路径、分段轨道；限制自发光强度避免过曝。前景 UI 的光只集中在边缘、候选和主操作。

光照统一为左上粉色主光、右后天蓝轮廓光、少量暖金点光；室内环境贴图由 Three.js RoomEnvironment 在本地生成，经 PMREM 处理后释放生成器，不请求外部贴图。

首页和观察台分别挂载同一个场景模块，路由互斥，正常页面仅一个 WebGL 上下文。首页的核心、行星和三个微场景在同一个 renderer 中，不为每张入口创建画布。

## 场景与动效

- 首页：核心主视觉、裁切远景行星、批量星点、实体仪器与连接光路；微场景是明确标记的装饰预览，DOM 入口启动真正实验。
- 观察台：核心读取 `coreState`，请求/Mock/本地计算时加速；收到真实或模拟结果时局部脉冲；错误使用绯红并保留文字；暂停停止轨道。选中历史快照不驱动当前结果动画。
- Tetris：逻辑仍为 Canvas 二维棋盘。CSS 容器提供厚度与可选 5° / −8° 展示视角；默认正视；Canvas 同向倒角高光、线框 ghost、粉紫目标。`landing.ts` 从实际锁定姿态计算消行前行号，落地/消行反馈不写回游戏。
- Pathfinding：CSS 3D 沙盘保留全部合法按钮，26° 俯角展示地形，俯视分析消除遮挡；线条沿 `state.visited`，不会在等待模型时改变位置。
- Playground：关系板来自校验后的当前题目；不把粒子或装饰亮度当作概率。

节奏 token：hover 180ms、面板约 550–600ms、装置持续转动、宇宙约 90s。不同轨道反向且倾角不同，避免同步呼吸。移动端固定点击区域，输入聚焦时停止指针驱动的空间偏移。

## 质量、生命周期与降级

画质预算见 README。默认增强，影院提高几何/粒子/透射，标准减少外围细节，减少动态保留静态实体。低核数/内存设备提示会把有效档限制为标准；系统减少动态优先。

- RAF 仅在可见且页面前台运行；IntersectionObserver 暂停离屏装置，visibilitychange 停止后台循环。
- ResizeObserver 重新构图，DPR 设置上限。每 1.5 秒更新局部监测数字，不逐帧更新整个 React 应用。
- 卸载取消 RAF、监听器和 observer，并释放几何、材质、环境贴图与 renderer。
- 动态导入 Three.js；未加载完即可点击实验入口。未支持 WebGL、加载失败或 context lost 显示 CSS 备用装置；手动重试重建资源，浏览器恢复事件也可重启。
- 支持用户主动切换首页备用视图。此开关不改实验状态；实际 context-loss 恢复分支尚未通过强制 GPU 丢失验证。

监测数字是本地窗口的 FPS、CPU render 调用耗时、draw calls、三角形和 DPR；不表示远端模型进度或 GPU 延迟。没有全屏 Bloom、景深、多层实时阴影或视频录制。

## 关键文件

| 文件                               | 责任                                       |
| ---------------------------------- | ------------------------------------------ |
| visual/tokens.ts                   | 原色、材质、质量和动效预算                 |
| visual/ObservatoryScene.ts         | Three.js 场景、灯光、几何、RAF、清理与采样 |
| visual/Observatory.tsx             | 首页构图、真实 DOM 入口、降级与监测        |
| visual/LiveCore.tsx                | 观察台真实状态到 3D 呈现的单向绑定         |
| visual/VisualContext.ts            | 仅显示质量的 React 上下文                  |
| visual/landing.ts                  | 消行位置的纯展示计算                       |
| visual/equipment.css               | CSS 备用装置与目录预览几何                 |
| spatial.css                        | 语义色、面板厚度、响应式空间与交互规则     |
| components/TetrisBoard.tsx         | 原有 Canvas 棋盘及实际事件光带             |
| experiments/PathfindingLab.tsx     | 实际地图及双视角呈现                       |
| experiments/DecisionPlayground.tsx | 实际题目关系板与二维编辑器                 |

没有在本轮改写后端、数据库或游戏规则。工作区中已有的 transport/.gitignore 修改来自此前供应商排查，应与本轮视觉变更区分。
## 首页粒子共振：参考视频重建（2026-09-21）

参考为 7.17 秒、30 FPS 的录屏。检查过 48 个采样帧，本轮再对照 0、1、2、3、3.9、3.93、4.2、5.5、7 秒的关键画面。`frontend/src/visual/ResonanceField.ts` 构造七层空心圆环、串珠光轴与三组五线谱。主体与符号均不使用爱心几何。

| 视频区间 | 观察到的特征 | 程序化呈现 |
| --- | --- | --- |
| 全程（包括首次加载、重播、拖动时间） | 圆环清楚、光轴向右下近处延伸；符号沿环与谱线移动 | 只保留斜前方方向，角度小幅缓变；圆环保持分离，串珠半径轻微脉动，不再使用侧视开场或切镜 |

粒子位置与波形由 GPU 计算，每帧只更新时间及观察方向，不上传整个点云，也不重新随机生成位置。标准 / 增强 / 影院档分别为 10,060 / 24,100 / 37,240 个粒子，装置本身只有两批绘制（Points 与 LineSegments）。圆环、串珠和谱线的点与线共用路径函数；音符、星形、四角闪光、空心圆/方形/三角形沿相同路径连续运动。近处粒子通过透视略大略亮，远处变小变暗。减少动态档静态呈现。

镜头时序在不依赖 React 的 `resonanceChoreography.ts` 中定义。装置底部可暂停、用滑条定格 0–7.17 秒，以及重播参考镜头；滑条到达终点不停止实际动画。这些控件只影响装饰装置，不控制实验或发起模型请求。

复用 ObservatoryScene 的离屏/后台暂停及资源清理，质量切换会释放旧几何体与材质。首页保留珠光核心切换；粒子装置显示时隐藏其后的大型 3D 行星并压暗局部背景。没有读取音频、麦克风或模型数据。该效果是根据录屏观察实现的近似，不是原视频源码或逐帧精确复刻。
