import { useEffect, useState } from "react";
import {
  pathDefinition,
  createPath,
  pathCandidates,
  pathQuestions,
  applyPath,
  pathTerminal,
  pathMetrics,
  shortestPath,
  samePoint,
  type PathState,
} from "../../../shared/experiments/pathfinding";
import { useLabRunner, type RunnerDefinition } from "../lab/useLabRunner";
import { useLab, Workspace } from "../lab/context";
import { Observer, statusLabels } from "../lab/Observer";
import type { RunMode } from "../../../shared/lab/records";
const definition: RunnerDefinition<PathState> = {
  ...pathDefinition,
  seed: (s) => s.seed,
  candidates: (s) =>
    pathCandidates(s).map((c, i) => ({
      questionId: "move",
      id: c.id,
      label: `${c.label} (${c.x},${c.y})`,
      details: `距终点 ${c.distance} · 已访问 ${c.visits} 次`,
      baseline: i === 0,
    })),
  execute: (s, answers) => {
    const a = answers.move;
    if (a?.type !== "choice") throw Error("缺少 move.choice");
    const next = applyPath(s, a.choice);
    return {
      state: next,
      action: a.choice,
      execution: {
        from: s.position,
        to: next.position,
        reached: pathTerminal(next) === "success",
      },
    };
  },
  local: (s) => ({ move: { type: "choice", choice: pathCandidates(s)[0].id } }),
};
export function PathGrid({
  state,
  baseline = false,
  target,
  onCell,
  perspective = false,
}: {
  state: PathState;
  baseline?: boolean;
  target?: string;
  onCell?: (x: number, y: number) => void;
  perspective?: boolean;
}) {
  const route = baseline
    ? shortestPath(state.grid, state.start, state.goal)
    : [];
  const candidate = pathCandidates(state).find((c) => c.id === target);
  return (
    <div
      className={`path-sandbox ${perspective ? "sandbox-perspective" : "sandbox-top"}`}
    >
      <div className="path-grid" role="group" aria-label="完全可见路径地图">
        {state.grid.flatMap((row, y) =>
          row.map((wall, x) => {
            const p = { x, y },
              start = samePoint(p, state.start),
              goal = samePoint(p, state.goal),
              current = samePoint(p, state.position),
              visits = state.visited.filter((v) => samePoint(v, p)).length;
            return (
              <button
                key={`${x},${y}`}
                type="button"
                disabled={!onCell}
                aria-label={`坐标 ${x},${y}${wall ? " 障碍" : ""}${start ? " 起点" : ""}${goal ? " 终点" : ""}${current ? " 当前位置" : ""}`}
                onClick={() => onCell?.(x, y)}
                className={`path-cell ${wall ? "wall" : ""} ${route.some((v) => samePoint(v, p)) ? "baseline" : ""} ${visits ? "visited" : ""} ${visits > 1 ? "revisited" : ""} ${candidate && samePoint(candidate, p) ? "target" : ""} ${current ? "current" : ""}`}
              >
                {!!wall && <i className="obstacle-volume" aria-hidden="true" />}
                {goal && <i className="goal-beacon" aria-hidden="true" />}
                {start && <i className="start-beacon" aria-hidden="true" />}
                {current && <i className="agent-probe" aria-hidden="true" />}
                <span>
                  {current
                    ? "●"
                    : goal
                      ? "◎"
                      : start
                        ? "S"
                        : visits > 1
                          ? visits
                          : visits
                            ? "·"
                            : ""}
                </span>
              </button>
            );
          }),
        )}
        <svg
          className="actual-route"
          viewBox={`0 0 ${state.grid[0].length} ${state.grid.length}`}
          aria-label="实际已走路径"
        >
          <polyline
            points={state.visited
              .map((v) => `${v.x + 0.5},${v.y + 0.5}`)
              .join(" ")}
          />
        </svg>
      </div>
    </div>
  );
}
export default function PathfindingLab() {
  const [perspective, setPerspective] = useState(true);
  const { settings } = useLab();
  const [seed, setSeed] = useState(settings.seed),
    [maxSteps, setMaxSteps] = useState(100);
  const runner = useLabRunner(definition, createPath(seed, maxSteps), seed);
  const [baseline, setBaseline] = useState(true),
    [hover, setHover] = useState<string>();
  useEffect(() => setHover(undefined), [runner.runId, runner.state.version]);
  const terminal = pathTerminal(runner.state);
  const shortest = shortestPath(
    runner.state.grid,
    runner.state.start,
    runner.state.goal,
  );
  function reset() {
    setHover(undefined);
    runner.reset(createPath(seed, maxSteps));
  }
  const metrics = {
    ...pathMetrics(runner.state),
    请求次数: runner.counts.requests,
    累计耗时: `${runner.counts.latency} ms`,
    状态: statusLabels[runner.status],
  };
  return (
    <Workspace
      observer={
        <Observer
          key={runner.runId}
          stage={runner.stage}
          current={runner.current}
          steps={runner.steps}
          metrics={metrics}
          onHover={setHover}
          snapshot={(s) => <PathGrid state={s.state as PathState} />}
        />
      }
    >
      <section className="panel lab-environment">
        <div className="panel-header">
          <h2>完全可见地图 · 12 × 12</h2>
          <span className="badge">{statusLabels[runner.status]}</span>
        </div>
        <div className="environment-body">
          <div className="lab-controls">
            <label>
              运行模式
              <select
                aria-label="路径运行模式"
                value={runner.mode}
                onChange={(e) => {
                  setHover(undefined);
                  runner.setMode(e.target.value as RunMode);
                }}
              >
                <option value="mock">Mock 模拟</option>
                <option value="local">本地 BFS 基线</option>
                <option value="real">真实 AI</option>
              </select>
            </label>
            <label>
              随机种子
              <input
                aria-label="路径随机种子"
                type="number"
                min={0}
                max={4294967295}
                value={seed}
                onChange={(e) => {
                  runner.pause();
                  setSeed(
                    Math.max(0, Math.min(4294967295, Number(e.target.value))),
                  );
                }}
              />
            </label>
            <label>
              最大步数
              <input
                type="number"
                min={1}
                max={500}
                value={maxSteps}
                onChange={(e) => {
                  runner.pause();
                  setMaxSteps(
                    Math.max(1, Math.min(500, Number(e.target.value))),
                  );
                }}
              />
            </label>
          </div>
          <p className="muted">
            种子和最大步数修改后点击“重置地图”生效。暂停时可点击空格编辑障碍；修改会创建新运行。
          </p>
          {hover && <p className="cyan">候选快照 · 决策前位置（非当前位置）</p>}
          <div className="view-switch" role="group" aria-label="地图视角">
            <button
              aria-pressed={perspective}
              onClick={() => setPerspective(true)}
            >
              立体沙盘
            </button>
            <button
              aria-pressed={!perspective}
              onClick={() => setPerspective(false)}
            >
              俯视分析
            </button>
          </div>
          <PathGrid
            perspective={perspective}
            state={
              hover && runner.current
                ? (runner.current.state as PathState)
                : runner.state
            }
            baseline={baseline}
            target={hover}
            onCell={
              runner.running || !!hover
                ? undefined
                : (x, y) => {
                    const s = runner.state;
                    if (
                      samePoint({ x, y }, s.start) ||
                      samePoint({ x, y }, s.goal)
                    )
                      return;
                    const grid = s.grid.map((r) => [...r]);
                    grid[y][x] = 1 - grid[y][x];
                    setHover(undefined);
                    runner.reset({
                      ...s,
                      grid,
                      position: s.start,
                      visited: [s.start],
                      version: 0,
                    });
                  }
            }
          />
          <div className="map-legend">
            <span>● 当前</span>
            <span>◎ 目标</span>
            <span>深色 ■ 障碍</span>
            <span>紫色 · 已走</span>
            <span>橙色数字 · 重复访问</span>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={baseline}
              onChange={(e) => setBaseline(e.target.checked)}
            />
            显示 BFS 最短路径基线（虚线）
          </label>
          <div className="lab-metrics">
            {Object.entries(metrics).map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <b>{typeof v === "boolean" ? (v ? "是" : "否") : v}</b>
              </div>
            ))}
          </div>
          {!shortest.length && (
            <p className="error">编辑后的地图无解，请移除障碍或重置地图。</p>
          )}
          {runner.error && (
            <p className="error" role="alert">
              {runner.error}
            </p>
          )}
          <div className="lab-buttons">
            <button
              className="primary"
              disabled={!!terminal || !shortest.length}
              onClick={() =>
                runner.running ? runner.pause() : void runner.start()
              }
            >
              {runner.running ? "暂停" : "开始 / 继续"}
            </button>
            <button
              disabled={runner.running || !!terminal || !shortest.length}
              onClick={() => void runner.start(true)}
            >
              单步执行
            </button>
            <button onClick={reset}>重置地图</button>
          </div>
          <p className="muted">
            模型只能选择合法相邻动作。真实模式逐步执行模型返回的 choice；本地
            BFS 和错误后的兜底均独立标记。
          </p>
        </div>
      </section>
    </Workspace>
  );
}
