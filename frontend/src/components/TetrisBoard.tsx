import { useEffect, useRef } from "react";
import type { Board, Candidate, Piece } from "../../../shared/types";
import { cells, move } from "../../../shared/game/engine";
import { clearedRowPositions } from "../visual/landing";
import { palette } from "../visual/tokens";
export const COLORS = [
  "#101820",
  palette.mint,
  palette.highlight,
  palette.primary,
  palette.success,
  palette.peach,
  palette.info,
  palette.lavender,
];
export function TetrisBoard({
  board,
  piece,
  target,
  over = false,
  landingKey = 0,
  clearedLines = 0,
  display = false,
  lockEvent,
}: {
  board: Board;
  piece: Piece;
  target?: Candidate;
  over?: boolean;
  landingKey?: number;
  clearedLines?: number;
  display?: boolean;
  lockEvent?: { board: Board; piece: Piece };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const previous = useRef({ board, piece, landingKey, clearedLines });
  const flash = useRef<{ key: number; rows: number[]; y: number }>({
    key: 0,
    rows: [],
    y: 19,
  });
  // Rendering can skip intermediate movement frames. Hard drop from the last visible pose
  // uses the same engine move function; rows are shown only after a confirmed lock/clear.
  if (landingKey !== previous.current.landingKey) {
    const last = previous.current;
    const source = lockEvent ?? last;
    const landing = move(source.board, source.piece, "drop");
    flash.current = {
      key: landingKey,
      rows:
        clearedLines > last.clearedLines
          ? clearedRowPositions(source.board, landing)
          : [],
      y: Math.max(...cells(landing).map(([, y]) => y)),
    };
  }
  previous.current = { board, piece, landingKey, clearedLines };
  useEffect(() => {
    const canvas = ref.current!,
      ctx = canvas.getContext("2d")!,
      s = 30;
    ctx.clearRect(0, 0, 300, 600);
    const sky = ctx.createLinearGradient(0, 0, 300, 600);
    sky.addColorStop(0, "#090b20");
    sky.addColorStop(1, "#0b1229");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 300, 600);
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 10; x++) {
        ctx.strokeStyle = "#6774b51b";
        ctx.lineWidth = 0.6;
        ctx.strokeRect(x * s, y * s, s, s);
        if (board[y][x]) draw(x, y, COLORS[board[y][x]]);
      }
    function draw(x: number, y: number, color: string) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      const gradient = ctx.createLinearGradient(
        x * s,
        y * s,
        x * s + s,
        y * s + s,
      );
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, `${color}a8`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `${color}ee`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x * s + 2.5, y * s + 2.5, s - 5, s - 5);
      ctx.fillStyle = "#ffffff50";
      ctx.fillRect(x * s + 3, y * s + 3, s - 6, 2);
      ctx.fillStyle = "#ffffff15";
      ctx.fillRect(x * s + 5, y * s + 6, s - 10, s - 14);
      // Beveled solid: light from upper left, shaded lower/right faces.
      const left = x * s + 2,
        top = y * s + 2,
        right = x * s + s - 2,
        bottom = y * s + s - 2,
        bevel = 5;
      function face(points: number[][], fill: string) {
        ctx.beginPath();
        points.forEach(([px, py], i) =>
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py),
        );
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
      face(
        [
          [left, top],
          [right, top],
          [right - bevel, top + bevel],
          [left + bevel, top + bevel],
        ],
        "#ffffff70",
      );
      face(
        [
          [left, top],
          [left + bevel, top + bevel],
          [left + bevel, bottom - bevel],
          [left, bottom],
        ],
        "#d9eeff28",
      );
      face(
        [
          [right, top],
          [right, bottom],
          [right - bevel, bottom - bevel],
          [right - bevel, top + bevel],
        ],
        "#02071d70",
      );
      face(
        [
          [left, bottom],
          [left + bevel, bottom - bevel],
          [right - bevel, bottom - bevel],
          [right, bottom],
        ],
        "#02091d99",
      );
    }
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "#68788a";
    ctx.lineWidth = 1;
    for (const [x, y] of cells(move(board, piece, "drop"))) {
      ctx.fillStyle = "#a8d3ef0e";
      ctx.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
      ctx.strokeRect(x * s + 3, y * s + 3, s - 6, s - 6);
      ctx.strokeRect(x * s + 7, y * s + 7, s - 14, s - 14);
      ctx.beginPath();
      ctx.moveTo(x * s + 3, y * s + 3);
      ctx.lineTo(x * s + 7, y * s + 7);
      ctx.moveTo(x * s + 27, y * s + 27);
      ctx.lineTo(x * s + 23, y * s + 23);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const [x, y] of cells(piece))
      draw(
        x,
        y,
        COLORS[["I", "O", "T", "S", "Z", "J", "L"].indexOf(piece.type) + 1],
      );
    if (target) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = palette.primary;
      for (const [x, y] of cells({ ...piece, ...target })) {
        ctx.strokeRect(x * s + 1, y * s + 1, s - 2, s - 2);
        ctx.strokeStyle = `${palette.primary}55`;
        ctx.strokeRect(x * s + 4, y * s + 4, s - 8, s - 8);
        ctx.strokeStyle = palette.primary;
      }
    }
  }, [board, piece, target]);
  return (
    <div
      className={`board-wrap ${display ? "board-display" : "board-analysis"}`}
    >
      <div className="tank-depth" aria-hidden="true" />
      <div className="tank-corner corner-left" aria-hidden="true" />
      <div className="tank-corner corner-right" aria-hidden="true" />
      <canvas
        ref={ref}
        width={300}
        height={600}
        aria-label="俄罗斯方块棋盘，10 列 20 行"
        role="img"
      />
      {landingKey > 0 && (
        <span
          key={landingKey}
          style={{ top: `${flash.current.y * 5}%` }}
          className="landing-wave"
          aria-hidden="true"
        />
      )}
      {flash.current.rows.map((row) => (
        <span
          key={`${flash.current.key}-${row}`}
          style={{ top: `${row * 5}%` }}
          className="clear-row"
          aria-hidden="true"
        />
      ))}
      {over && (
        <div className="game-over">
          <strong>实验结束</strong>
          <span>已无出生空间 · 重新开始继续探索</span>
        </div>
      )}
    </div>
  );
}
export function MiniPiece({ type }: { type: Piece["type"] }) {
  return (
    <svg
      viewBox="0 0 120 70"
      aria-label={`下一块 ${type}`}
      className="mini-piece"
    >
      {cells({ type, x: 0, y: 0, rotation: 0 }).map(([x, y]) => (
        <rect
          key={`${x},${y}`}
          x={x * 24 + 12}
          y={y * 24 + 8}
          width="21"
          height="21"
          rx="2"
          fill={COLORS[["I", "O", "T", "S", "Z", "J", "L"].indexOf(type) + 1]}
        />
      ))}
    </svg>
  );
}
