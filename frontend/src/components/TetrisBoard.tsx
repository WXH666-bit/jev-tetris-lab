import { useEffect, useRef } from "react";
import type { Board, Candidate, Piece } from "../../../shared/types";
import { cells, move } from "../../../shared/game/engine";
export const COLORS = [
  "#101820",
  "#48c9df",
  "#e9c864",
  "#b391ec",
  "#61c999",
  "#f07885",
  "#6e9ae6",
  "#e8a26a",
];
export function TetrisBoard({
  board,
  piece,
  target,
  over = false,
  landingKey = 0,
}: {
  board: Board;
  piece: Piece;
  target?: Candidate;
  over?: boolean;
  landingKey?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
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
      ctx.shadowBlur = 9;
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
    }
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "#68788a";
    ctx.lineWidth = 1;
    for (const [x, y] of cells(move(board, piece, "drop")))
      ctx.strokeRect(x * s + 3, y * s + 3, s - 6, s - 6);
    ctx.setLineDash([]);
    for (const [x, y] of cells(piece))
      draw(
        x,
        y,
        COLORS[["I", "O", "T", "S", "Z", "J", "L"].indexOf(piece.type) + 1],
      );
    if (target) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#76e5d3";
      for (const [x, y] of cells({ ...piece, ...target }))
        ctx.strokeRect(x * s + 1, y * s + 1, s - 2, s - 2);
    }
  }, [board, piece, target]);
  return (
    <div className="board-wrap">
      <canvas
        ref={ref}
        width={300}
        height={600}
        aria-label="俄罗斯方块棋盘，10 列 20 行"
        role="img"
      />
      {landingKey > 0 && (
        <span key={landingKey} className="landing-wave" aria-hidden="true" />
      )}
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
