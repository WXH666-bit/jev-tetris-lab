import TetrisWorkspace from "../TetrisWorkspace";
import PathfindingLab, { PathGrid } from "../experiments/PathfindingLab";
import DecisionPlayground from "../experiments/DecisionPlayground";
import { experimentDefinitions } from "../../../shared/experiments/registry";
import type { ComponentType, ReactNode } from "react";
import type { StepRecord } from "../../../shared/lab/records";
import type { PathState } from "../../../shared/experiments/pathfinding";
import type { GameDecisionState } from "../../../shared/types";
import { TetrisBoard } from "../components/TetrisBoard";
import { JsonViewer } from "../components/JsonViewer";
type Entry = {
  component: ComponentType;
  snapshot: (step: StepRecord) => ReactNode;
};
export const frontendExperiments: Record<string, Entry> = {
  tetris: {
    component: TetrisWorkspace,
    snapshot: (r) => {
      const s = r.state as GameDecisionState;
      return (
        <div className="snapshot-board">
          <TetrisBoard
            board={s.board}
            piece={s.currentPiece}
            target={s.candidates.find((c) => c.id === r.action)}
          />
        </div>
      );
    },
  },
  pathfinding: {
    component: PathfindingLab,
    snapshot: (r) => <PathGrid state={r.state as PathState} />,
  },
  playground: {
    component: DecisionPlayground,
    snapshot: (r) => <JsonViewer label="历史 state" value={r.state} />,
  },
};
export const catalog = experimentDefinitions;
