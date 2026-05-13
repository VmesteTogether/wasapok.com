// Minimap renderer — bird's-eye view with player position + discovered tiles.
export function createMinimap(canvas, layout) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;
  const scale = Math.floor(Math.min(W / layout.width, H / layout.height));
  const offX = Math.floor((W - layout.width * scale) / 2);
  const offY = Math.floor((H - layout.height * scale) / 2);
  const visited = new Set();

  function markVisited(tx, ty) {
    visited.add(`${tx},${ty}`);
    // also mark neighbors within line-of-sight in 4 cardinals until wall
    for (let d = 0; d < 4; d++) {
      const dx = [0,1,0,-1][d], dy = [-1,0,1,0][d];
      let x = tx, y = ty;
      for (let i = 0; i < 6; i++) {
        x += dx; y += dy;
        if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) break;
        visited.add(`${x},${y}`);
        if (layout.grid[y][x] === 1) break;
      }
    }
  }

  function draw(player, artObjects) {
    markVisited(player.state.tx, player.state.ty);
    ctx.clearRect(0, 0, W, H);
    // grid
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        const cell = layout.grid[y][x];
        const seen = visited.has(`${x},${y}`);
        if (!seen) continue;
        const px = offX + x * scale, py = offY + y * scale;
        if (cell === 0) {
          ctx.fillStyle = '#3a2410';
          ctx.fillRect(px, py, scale, scale);
          ctx.fillStyle = 'rgba(244,215,137,0.05)';
          ctx.fillRect(px, py, scale, 1);
        } else if (cell === 1) {
          // walls only if adjacent to seen floor
          let adjSeen = false;
          for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            if (visited.has(`${x+dx},${y+dy}`) && layout.grid[y+dy]?.[x+dx] === 0) { adjSeen = true; break; }
          }
          if (adjSeen) {
            ctx.fillStyle = '#b8914a';
            ctx.fillRect(px, py, scale, scale);
          }
        }
        // cell === -1 is void, don't draw
      }
    }
    // art markers
    for (const a of artObjects) {
      if (!visited.has(`${a.tile.x},${a.tile.y}`)) continue;
      const px = offX + a.tile.x * scale, py = offY + a.tile.y * scale;
      ctx.fillStyle = '#5ce4ff';
      ctx.fillRect(px + Math.floor(scale/3), py + Math.floor(scale/3), Math.max(2, Math.floor(scale/3)), Math.max(2, Math.floor(scale/3)));
    }
    // player
    const px = offX + player.state.x * scale + scale / 2;
    const py = offY + player.state.y * scale + scale / 2;
    ctx.save();
    ctx.translate(px, py);
    // yaw=0 faces north (-Z world → up on minimap). Canvas rotate is CW-positive,
    // world yaw is CCW-positive (about Y), so negate it to get canvas-correct rotation.
    ctx.rotate(-player.state.yaw);
    ctx.fillStyle = '#ffd860';
    ctx.beginPath();
    ctx.moveTo(0, -scale * 0.7);
    ctx.lineTo(-scale * 0.45, scale * 0.5);
    ctx.lineTo(0, scale * 0.2);
    ctx.lineTo(scale * 0.45, scale * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1a0c04';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  return { draw, markVisited };
}
