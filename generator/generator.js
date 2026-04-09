// generator.js — populates the BPMNEditor instance created by app.js
// All rendering, dragging, arrow drawing, undo/redo comes from app.js

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    values.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] ?? '');
    return obj;
  });
}

// ── Layout ────────────────────────────────────────────────────────────────────
// Rules:
// - user_action_process, start, end → col 0 (main lane) unless forced right by conflict
// - decision → always col of predecessor + 1 (shift right)
// - after a branch rejoins main flow → snap back to col 0 if no conflict
// - parallel elements at same depth → bump right to avoid overlap
function computeLayout(elements, connections) {
  const COL_W = 240, ROW_H = 220, ORIGIN_X = 140, ORIGIN_Y = 80;

  const out = {}, inc = {};
  elements.forEach(e => { out[e.element_id] = []; inc[e.element_id] = []; });
  connections.forEach(c => {
    out[c.source_element_id]?.push(c.target_element_id);
    inc[c.target_element_id]?.push(c.source_element_id);
  });

  // Topological order via Kahn
  const inDeg = {};
  elements.forEach(e => inDeg[e.element_id] = inc[e.element_id].length);
  const queue = elements.filter(e => inDeg[e.element_id] === 0).map(e => e.element_id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    (out[id] || []).forEach(nid => { if (--inDeg[nid] === 0) queue.push(nid); });
  }
  elements.forEach(e => { if (!order.includes(e.element_id)) order.push(e.element_id); });

  // Longest-path depth (row)
  const depth = {};
  order.forEach(id => {
    const preds = inc[id] || [];
    depth[id] = preds.length === 0 ? 0 : Math.max(...preds.map(p => (depth[p] ?? 0) + 1));
  });

  const elMap = Object.fromEntries(elements.map(e => [e.element_id, e]));
  const col = {};

  order.forEach(id => {
    const el = elMap[id];
    const preds = inc[id] || [];
    const predCols = preds.map(p => col[p] ?? 0);
    const maxPredCol = predCols.length ? Math.max(...predCols) : 0;

    if (el.element_type === 'system_decision' || el.element_type === 'process_selection_by_system') {
      col[id] = maxPredCol + 1;
    } else if (el.element_type === 'system_action') {
      col[id] = maxPredCol;
    } else {
      col[id] = 0;
    }
  });

  // ── Y Assignment ──────────────────────────────────────────────────────────
  // Step 1: assign col-0 elements their order index
  const col0order = order.filter(id => col[id] === 0);

  // Step 2: for each gap between consecutive col-0 elements, count how many
  // branch elements need to fit in that gap, then expand the gap accordingly
  const MIN_GAP = 160; // minimum pixels between two col-0 elements
  const BRANCH_SLOT = 140; // pixels needed per branch element in a gap

  // Map each branch element to the gap it belongs to (between col0[i] and col0[i+1])
  const branchInGap = {}; // key: i → array of branch element ids
  col0order.forEach((_, i) => { branchInGap[i] = []; });

  order.filter(id => col[id] !== 0).forEach(id => {
    const findCol0Ancestor = (eid, visited = new Set()) => {
      if (visited.has(eid)) return null;
      visited.add(eid);
      if (col[eid] === 0) return eid;
      for (const p of (inc[eid] || [])) {
        const found = findCol0Ancestor(p, visited);
        if (found) return found;
      }
      return null;
    };
    const ancestor = findCol0Ancestor(id);
    const gapIdx = ancestor ? col0order.indexOf(ancestor) : 0;
    if (!branchInGap[gapIdx]) branchInGap[gapIdx] = [];
    branchInGap[gapIdx].push(id);
  });

  // Step 3: assign Y to col-0 elements with dynamic gaps
  const assignedY = {};
  const usedY = new Set();
  let currentY = ORIGIN_Y;

  col0order.forEach((id, i) => {
    assignedY[id] = currentY;
    usedY.add(currentY);
    const branchCount = (branchInGap[i] || []).length;
    const gap = Math.max(MIN_GAP, branchCount * BRANCH_SLOT + MIN_GAP);
    currentY += gap;
  });

  // Step 4: assign Y to branch elements — evenly distributed in their gap
  col0order.forEach((id, i) => {
    const branches = branchInGap[i] || [];
    if (branches.length === 0) return;
    const yA = assignedY[id];
    const yD = i + 1 < col0order.length ? assignedY[col0order[i + 1]] : yA + MIN_GAP;
    const slotH = (yD - yA) / (branches.length + 1);
    branches.forEach((bid, j) => {
      const y = Math.round(yA + slotH * (j + 1));
      assignedY[bid] = y;
      usedY.add(y);
    });
  });

  const pos = {};
  elements.forEach(e => {
    pos[e.element_id] = {
      x: ORIGIN_X + col[e.element_id] * COL_W,
      y: assignedY[e.element_id] ?? ORIGIN_Y
    };
  });

  elements.forEach(e => { e._col = col[e.element_id]; });
  return pos;
}

// ── Map CSV element_type → BPMNEditor type ────────────────────────────────────
function mapType(csvType) {
  switch (csvType) {
    case 'start':           return 'start';
    case 'end':             return 'end';
    case 'user_action_process': return 'process';
    case 'system_decision': return 'decision-x';
    case 'system_action':   return 'system_action';
    // legacy fallback
    case 'process_selection_by_system': return 'decision-x';
    default:                return 'process';
  }
}

// ── Forward port direction helper ─────────────────────────────────────────────
function getForwardDirs(srcEl, tgtEl) {
  const dx = tgtEl.x - srcEl.x;
  const dy = tgtEl.y - srcEl.y;
  if (dx < -30) return { startDir: 'left', endDir: 'right' };
  if (Math.abs(dy) >= Math.abs(dx) * 0.3) {
    return { startDir: dy >= 0 ? 'bottom' : 'top', endDir: dy >= 0 ? 'top' : 'bottom' };
  }
  return { startDir: 'right', endDir: 'left' };
}

// ── Best connection ports + waypoints for backward arrows ────────────────────
// Forward arrows: normal top/bottom/left/right routing
// Backward arrows (target depth < source depth): route far right with waypoints
function buildArrow(srcEl, tgtEl, label, isBackward, railX, startPortIndex, startPortTotal, endPortIndex, endPortTotal, leftMidX) {
  const SPREAD = 14;
  const spreadY = (idx, total, baseY) => total <= 1 ? baseY : baseY + (idx - (total - 1) / 2) * SPREAD;

  if (isBackward) {
    const srcPortY = spreadY(startPortIndex, startPortTotal, srcEl.y);
    const tgtPortY = spreadY(endPortIndex,   endPortTotal,   tgtEl.y);
    return {
      startDir: 'right',
      endDir:   'right',
      label,
      waypoints: [
        { x: railX, y: srcPortY },
        { x: railX, y: tgtPortY },
      ]
    };
  }

  const { startDir, endDir } = getForwardDirs(srcEl, tgtEl);

  // Left-going forward arrow with assigned intermediate X — inject waypoint to avoid overlap
  if (startDir === 'left' && leftMidX !== undefined) {
    const srcPortY = spreadY(startPortIndex, startPortTotal, srcEl.y);
    const tgtPortY = spreadY(endPortIndex,   endPortTotal,   tgtEl.y);
    return {
      startDir: 'left',
      endDir:   'right',
      label,
      waypoints: [
        { x: leftMidX, y: srcPortY },
        { x: leftMidX, y: tgtPortY },
      ]
    };
  }

  return { startDir, endDir, label, waypoints: [] };
}

// ── Neon colour palette per user_action_process ───────────────────────────────
const NEON_COLORS = ['#39ff14', '#00cfff', '#bf5fff', '#ff3f3f', '#ff9500'];
const elementColors = {}; // csvId → hex colour

function assignElementColors(csvElements) {
  let idx = 0;
  csvElements.forEach(e => {
    if (e.element_type === 'user_action_process') {
      elementColors[e.element_id] = NEON_COLORS[idx % NEON_COLORS.length];
      idx++;
    }
  });
}

// Returns { color, opacity } for an arrow given its source element
// Backward arrows get the same hue at 40% opacity
function arrowStyle(srcCsvId, isBackward) {
  const color = elementColors[srcCsvId];
  if (!color) return { color: '#888888', opacity: 1 };
  return { color, opacity: isBackward ? 0.4 : 1 };
}


const userStories = {}; // element_id → { user_story, technical_aspects, alternative_paths }

document.getElementById('userstories-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await readFile(file);
  const rows = parseCSV(text);
  rows.forEach(r => {
    if (r.element_id) userStories[r.element_id.trim()] = r;
  });
  document.getElementById('status').textContent = `User stories loaded: ${rows.length} entries.`;
  // Re-render icons if diagram already loaded
  if (editor.elements.length) renderStoryIcons();
});

// ── Apply neon colours to rendered arrows and process box borders ─────────────
function applyArrowColors() {
  editor.arrows.forEach(arrow => {
    // Subprocess arrows get a neutral visible colour, not skipped
    const isSp = !!arrow._subprocess;
    if (!arrow._srcCsvId && !isSp) return;
    const { color, opacity } = isSp
      ? { color: '#666666', opacity: 1 }
      : arrowStyle(arrow._srcCsvId, arrow._isBackward);
    const dash = !isSp && (arrow._srcType === 'system_decision' ? '6,3'
               : arrow._srcType === 'system_action'   ? '2,3'
               : null);
    document.querySelectorAll(`[data-arrow-id="${arrow.id}"]`).forEach(el => {
      if (el.tagName === 'path') {
        el.setAttribute('stroke', color);
        el.style.opacity = opacity;
        if (dash) el.setAttribute('stroke-dasharray', dash);
        else el.removeAttribute('stroke-dasharray');
      } else if (el.tagName === 'polygon') {
        el.setAttribute('fill', color);
        el.setAttribute('stroke', color);
        el.style.opacity = opacity;
      }
    });
  });

  // Colour process box borders by their origin colour
  editor.elements.forEach(el => {
    if (el.type !== 'process' || !el._csvId) return;
    const color = elementColors[el._csvId];
    if (!color) return;
    const g = document.querySelector(`[data-id="${el.id}"]`);
    const rect = g && g.querySelector('.process-box');
    if (rect) rect.setAttribute('stroke', color);
  });
}

// ── Trigger & validation icons on outbound arrow start points ─────────────────
// One trigger icon + one validation icon per arrow, placed at the arrow's start port.
// Clicking toggles a small popup showing the detail.

const _connPopups = {}; // key → visible bool

function arrowStartPort(arrow) {
  const el = editor.elements.find(e => e.id === arrow.start);
  if (!el) return null;
  const hw = el.type === 'process' ? 90 : el.type === 'decision-x' ? 50 : el.type === 'system_action' ? 65 : 20;
  const hh = el.type === 'process' ? 30 : el.type === 'decision-x' ? 50 : el.type === 'system_action' ? 25 : 20;
  switch (arrow.startDir) {
    case 'right':  return { x: el.x + hw, y: el.y };
    case 'left':   return { x: el.x - hw, y: el.y };
    case 'top':    return { x: el.x, y: el.y - hh };
    case 'bottom': return { x: el.x, y: el.y + hh };
    default:       return { x: el.x, y: el.y };
  }
}

function renderConnectionIcons() {
  document.querySelectorAll('.conn-icon-group').forEach(el => el.remove());
  const svg = document.getElementById('canvas');

  editor.arrows.forEach(arrow => {
    if (arrow._subprocess) return;
    const hasTrigger    = arrow._trigger && arrow._trigger !== 'await';
    const hasValidation = !!arrow._validation;
    if (!hasTrigger && !hasValidation) return;

    const port = arrowStartPort(arrow);
    if (!port) return;

    // Offset icons slightly away from the port along the start direction
    const OFFSET = 14;
    let ox = 0, oy = 0;
    switch (arrow.startDir) {
      case 'right':  ox =  OFFSET; oy = -10; break;
      case 'left':   ox = -OFFSET; oy = -10; break;
      case 'bottom': ox = -10; oy =  OFFSET; break;
      case 'top':    ox = -10; oy = -OFFSET; break;
    }

    let slotX = port.x + ox;
    const slotY = port.y + oy;
    const ICON_W = 14, ICON_GAP = 4;

    const mkSvg = (tag, attrs) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      return el;
    };

    function makeIcon(ix, iy, symbol, fillColor, borderColor, popupLines, key) {
      const g = mkSvg('g', { class: 'conn-icon-group' });
      g.style.cursor = 'pointer';

      g.appendChild(mkSvg('rect', {
        x: ix, y: iy, width: ICON_W, height: ICON_W,
        rx: 3, fill: '#111', stroke: borderColor, 'stroke-width': '1'
      }));

      const sym = mkSvg('text', {
        x: ix + ICON_W / 2, y: iy + ICON_W / 2,
        'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': '8',
        fill: fillColor, 'pointer-events': 'none'
      });
      sym.textContent = symbol;
      g.appendChild(sym);

      // Popup — always grey regardless of icon colour
      const popW = Math.max(...popupLines.map(l => l.length * 5.5 + 16), 60);
      const popH = popupLines.length * 14 + 10;
      const popX = ix - 4, popY = iy + ICON_W + 4;

      const popG = mkSvg('g', {});
      popG.style.display = _connPopups[key] ? 'block' : 'none';

      popG.appendChild(mkSvg('rect', {
        x: popX, y: popY, width: popW, height: popH,
        rx: 4, fill: '#111', stroke: '#444', 'stroke-width': '1'
      }));
      popupLines.forEach((line, li) => {
        const t = mkSvg('text', {
          x: popX + 8, y: popY + 12 + li * 14,
          'font-size': '9', fill: '#aaa'
        });
        t.textContent = line;
        popG.appendChild(t);
      });
      g.appendChild(popG);

      g.addEventListener('click', e => {
        e.stopPropagation();
        _connPopups[key] = !_connPopups[key];
        popG.style.display = _connPopups[key] ? 'block' : 'none';
      });

      svg.appendChild(g);
    }

    // Trigger icon
    if (hasTrigger) {
      const arrowColor = arrowStyle(arrow._srcCsvId, arrow._isBackward).color;
      const symbol = arrow._trigger === 'button' ? 'B' : '⏱';
      const color  = arrow._trigger === 'button' ? arrowColor : '#777';
      const border = arrow._trigger === 'button' ? arrowColor : '#333';
      const lines = [];
      if (arrow._trigger) lines.push(`Trigger: ${arrow._trigger}`);
      if (arrow._button)  lines.push(`Button: "${arrow._button}"`);
      makeIcon(slotX, slotY, symbol, color, border, lines, `${arrow.id}_t`);
      slotX += ICON_W + ICON_GAP;
    }

    // Validation icon
    if (hasValidation) {
      const arrowColor = arrowStyle(arrow._srcCsvId, arrow._isBackward).color;
      makeIcon(slotX, slotY, 'V', '#d94444', arrowColor,
        [`Validation: ${arrow._validation}`], `${arrow.id}_v`);
    }
  });
}

// ── Shared process box icon helper ───────────────────────────────────────────
// All process box icons: small rounded square, letter centered, stacked
// vertically on the LEFT side of the box (outside the box edge).
const PROC_ICON_SIZE = 14;
const PROC_ICON_GAP  = 4;

function makeProcIcon(svg, el, slotIndex, letter, letterColor, borderColor, onClick) {
  const ix = el.x - 90 - PROC_ICON_SIZE - 6; // left of box
  const iy = el.y - 30 + slotIndex * (PROC_ICON_SIZE + PROC_ICON_GAP);

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.style.cursor = 'pointer';
  g.style.opacity = '0.7';
  g.addEventListener('mouseenter', () => g.style.opacity = '1');
  g.addEventListener('mouseleave', () => g.style.opacity = '0.7');

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', ix); rect.setAttribute('y', iy);
  rect.setAttribute('width', PROC_ICON_SIZE); rect.setAttribute('height', PROC_ICON_SIZE);
  rect.setAttribute('rx', '3');
  rect.setAttribute('fill', '#111');
  rect.setAttribute('stroke', borderColor);
  rect.setAttribute('stroke-width', '1.5');
  g.appendChild(rect);

  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('x', ix + PROC_ICON_SIZE / 2);
  t.setAttribute('y', iy + PROC_ICON_SIZE / 2);
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('dominant-baseline', 'central');
  t.setAttribute('font-size', '8');
  t.setAttribute('font-weight', 'bold');
  t.setAttribute('fill', letterColor);
  t.setAttribute('pointer-events', 'none');
  t.textContent = letter;
  g.appendChild(t);

  g.addEventListener('click', e => { e.stopPropagation(); onClick(e); });
  svg.appendChild(g);
  return g;
}

function renderStoryIcons() {
  document.querySelectorAll('.story-icon').forEach(el => el.remove());
  const svg = document.getElementById('canvas');

  Object.entries(userStories).forEach(([csvId, story]) => {
    const editorEl = editor.elements.find(e => e._csvId === csvId);
    if (!editorEl || editorEl.type !== 'process') return;

    const g = makeProcIcon(svg, editorEl, 1, 'U', '#888888', '#444444', () => openStoryPanel(csvId));
    g.setAttribute('class', 'story-icon');
    g.dataset.csvId = csvId;
  });
}

function openStoryPanel(csvId) {
  const story = userStories[csvId];
  if (!story) return;
  const panel = document.getElementById('story-panel');
  const content = document.getElementById('story-panel-content');
  content.innerHTML = `
    <div class="story-section">
      <div class="story-section-label">User Story</div>
      <div class="story-section-text">${story.user_story || '—'}</div>
    </div>
    <div class="story-section">
      <div class="story-section-label">Aspekty techniczne</div>
      <div class="story-section-text">${story.technical_aspects || '—'}</div>
    </div>
    <div class="story-section">
      <div class="story-section-label">Ścieżki alternatywne</div>
      <div class="story-section-text">${story.alternative_paths || '—'}</div>
    </div>
  `;
  panel.classList.add('open');
}

document.getElementById('story-panel-close').addEventListener('click', () => {
  document.getElementById('story-panel').classList.remove('open');
});

// ── Subprocess S icon — slot 0 on all process elements ───────────────────────
function renderSubprocessIcon() {
  document.querySelectorAll('.subprocess-icon').forEach(el => el.remove());
  const svg = document.getElementById('canvas');
  editor.elements.forEach(el => {
    if (el.type !== 'process' || el._subprocess) return;
    const g = makeProcIcon(svg, el, 0, 'S', '#7dd3fc', '#2a6a9a', () => toggleSubprocessPanel());
    g.setAttribute('class', 'subprocess-icon');
  });
}


function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = () => reject(new Error('Failed to read ' + file.name));
    r.readAsText(file);
  });
}

// ── Load & inject into BPMNEditor ─────────────────────────────────────────────
document.getElementById('load-btn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  const eFile = document.getElementById('elements-file').files[0];
  const cFile = document.getElementById('connections-file').files[0];

  if (!eFile || !cFile) { status.textContent = 'Please select both CSV files.'; return; }
  status.textContent = 'Loading…';

  try {
    const [eText, cText] = await Promise.all([readFile(eFile), readFile(cFile)]);
    const csvElements    = parseCSV(eText);
    const csvConnections = parseCSV(cText);

    const positions = computeLayout(csvElements, csvConnections);
    assignElementColors(csvElements);

    // Reset editor state completely
    editor.elements      = [];
    editor.arrows        = [];
    editor.history       = [];
    editor.historyIndex  = -1;
    editor.selectedElement = null;
    editor.selectedArrow   = null;

    const maxCol = Math.max(...csvElements.map(e => e._col ?? 0), 0);

    // Calculate farX: rightmost element edge + large margin for backward arrow rail
    const elementRightEdge = (e) => {
      const pos = positions[e.element_id];
      if (!pos) return 0;
      if (e.element_type === 'user_action_process') return pos.x + 90;
      if (e.element_type === 'process_selection_by_system') return pos.x + 50;
      return pos.x + 20;
    };
    const farX = Math.max(...csvElements.map(elementRightEdge), 400) + 120;
    window._diagramFarX = farX; // expose for subprocess panel positioning

    let _uid = Date.now();
    const uid = () => ++_uid;
    const idMap = {};
    csvElements.forEach(e => {
      const numId = Date.now() + Math.floor(Math.random() * 1e6);
      idMap[e.element_id] = numId;
      const pos = positions[e.element_id];

      editor.elements.push({
        id:          numId,
        type:        mapType(e.element_type),
        x:           pos.x,
        y:           pos.y,
        title:       e.element_name || e.element_id,
        expanded:    false,
        subElements: [],
        minimized:   false,
        _csvId:      e.element_id
      });
    });

    // Separate backward and forward connections
    const backwardConns = [];
    const forwardConns  = [];
    csvConnections.forEach(c => {
      const srcPos = positions[c.source_element_id];
      const tgtPos = positions[c.target_element_id];
      if (!srcPos || !tgtPos) return;
      // Backward = target has lower or equal topological depth than source
      if (tgtPos.y < srcPos.y) backwardConns.push(c);
      else forwardConns.push(c);
    });

    // Sort backward arrows by vertical span ASCENDING: smallest span = rightmost rail
    // This creates { ( ) } - largest span uses leftmost (innermost) rail, smallest uses outermost
    // Wait - { ( ) } means largest span is OUTERMOST = rightmost
    // So sort descending by span, index 0 = largest span = rightmost rail
    backwardConns.sort((a, b) => {
      const spanA = (positions[a.source_element_id]?.y ?? 0) - (positions[a.target_element_id]?.y ?? 0);
      const spanB = (positions[b.source_element_id]?.y ?? 0) - (positions[b.target_element_id]?.y ?? 0);
      return spanB - spanA; // largest span first = gets highest railX index
    });

    const BACK_RAIL_SPACING = 30;
    const backwardRailX = {};
    const backwardByTarget = {};
    backwardConns.forEach(c => {
      const tgt = c.target_element_id;
      if (!backwardByTarget[tgt]) backwardByTarget[tgt] = [];
      backwardByTarget[tgt].push(c);
    });

    // Within each target group, assign rails: largest span = rightmost (highest X)
    Object.values(backwardByTarget).forEach(group => {
      const n = group.length;
      group.forEach((c, i) => {
        backwardRailX[`${c.source_element_id}→${c.target_element_id}`] = farX + (n - 1 - i) * BACK_RAIL_SPACING;
      });
    });

    // Pre-compute intermediate X for left-going forward arrows sharing same target
    // Lower source = more right intermediate vertical segment (bracket ordering)
    const leftArrowsByTarget = {};
    [...forwardConns, ...backwardConns].forEach(c => {
      const srcEl = editor.elements.find(e => e.id === idMap[c.source_element_id]);
      const tgtEl = editor.elements.find(e => e.id === idMap[c.target_element_id]);
      if (!srcEl || !tgtEl) return;
      // Left-going = target is to the left of source (regardless of Y)
      if (tgtEl.x < srcEl.x - 30) {
        const key = c.target_element_id;
        if (!leftArrowsByTarget[key]) leftArrowsByTarget[key] = [];
        leftArrowsByTarget[key].push(c);
      }
    });
    const leftArrowMidX = {};
    const LEFT_RAIL_SPACING = 24;
    Object.entries(leftArrowsByTarget).forEach(([tgtId, group]) => {
      // Sort by source Y descending (bottommost = outermost/rightmost), tiebreak by element_id
      group.sort((a, b) => {
        const dy = (positions[b.source_element_id]?.y ?? 0) - (positions[a.source_element_id]?.y ?? 0);
        return dy !== 0 ? dy : a.source_element_id.localeCompare(b.source_element_id);
      });
      const tgtEl = editor.elements.find(e => e.id === idMap[tgtId]);
      const tgtX = tgtEl ? tgtEl.x + 60 : 200;
      group.forEach((c, i) => {
        leftArrowMidX[`${c.source_element_id}→${c.target_element_id}`] = tgtX + 20 + i * LEFT_RAIL_SPACING;
      });
    });
    const portTotals = {};
    [...forwardConns, ...backwardConns].forEach(c => {
      const srcId = idMap[c.source_element_id];
      const tgtId = idMap[c.target_element_id];
      if (!srcId || !tgtId) return;
      const srcEl = editor.elements.find(e => e.id === srcId);
      const tgtEl = editor.elements.find(e => e.id === tgtId);
      if (!srcEl || !tgtEl) return;
      const srcPos = positions[c.source_element_id];
      const tgtPos = positions[c.target_element_id];
      const isBackwardConn = tgtPos.y < srcPos.y;
      const isLeftGoingConn = !isBackwardConn && tgtEl.x < srcEl.x - 30;
      const startDir = isBackwardConn ? 'right' : (isLeftGoingConn ? 'left' : getForwardDirs(srcEl, tgtEl).startDir);
      const endDir   = isBackwardConn ? 'right' : (isLeftGoingConn ? 'right' : getForwardDirs(srcEl, tgtEl).endDir);
      const sk = `${srcId}:${startDir}`;
      const ek = `${tgtId}:${endDir}`;
      portTotals[sk] = (portTotals[sk] || 0) + 1;
      portTotals[ek] = (portTotals[ek] || 0) + 1;
    });

    // Build arrows — pre-assign portIndex so each arrow mounts to a specific point
    const portCounter = {};
    [...forwardConns, ...backwardConns].forEach(c => {
      const srcId = idMap[c.source_element_id];
      const tgtId = idMap[c.target_element_id];
      if (!srcId || !tgtId) return;

      const srcEl = editor.elements.find(e => e.id === srcId);
      const tgtEl = editor.elements.find(e => e.id === tgtId);
      if (!srcEl || !tgtEl) return;

      const srcPos = positions[c.source_element_id];
      const tgtPos = positions[c.target_element_id];
      const label = c.button || c.condition || '';
      const isBackward = tgtPos.y < srcPos.y;
      const railX = isBackward ? (backwardRailX[`${c.source_element_id}→${c.target_element_id}`] ?? farX) : farX;

      const isLeftGoing = !isBackward && tgtEl.x < srcEl.x - 30;
      const startDir = isBackward ? 'right' : (isLeftGoing ? 'left' : getForwardDirs(srcEl, tgtEl).startDir);
      const endDir   = isBackward ? 'right' : (isLeftGoing ? 'right' : getForwardDirs(srcEl, tgtEl).endDir);
      const sk = `${srcId}:${startDir}`;
      const ek = `${tgtId}:${endDir}`;
      const startPortIndex = portCounter[sk] || 0;
      portCounter[sk] = startPortIndex + 1;
      const endPortIndex = portCounter[ek] || 0;
      portCounter[ek] = endPortIndex + 1;

      const arrow = buildArrow(srcEl, tgtEl, label, isBackward, railX,
        startPortIndex, portTotals[sk] || 1,
        endPortIndex,   portTotals[ek] || 1,
        leftArrowMidX[`${c.source_element_id}→${c.target_element_id}`]);

      editor.arrows.push({
        id:             Date.now() + Math.floor(Math.random() * 1e6),
        start:          srcId,
        end:            tgtId,
        startDir:       arrow.startDir,
        endDir:         arrow.endDir,
        label:          arrow.label,
        waypoints:      arrow.waypoints,
        startPortIndex,
        endPortIndex,
        _srcCsvId:      c.source_element_id,
        _isBackward:    isBackward,
        _srcType:       (csvElements.find(e => e.element_id === c.source_element_id) || {}).element_type,
        _trigger:       c.trigger    || '',
        _button:        c.button     || '',
        _validation:    c.validation || ''
      });
    });

    // ── Post-process: detect overlapping vertical segments, reassign port indices ──
    // Compute paths in memory only. For arrows sharing the same intermediate X,
    // reassign their endPortIndex so they land on different spread connection points.
    {
      const OFF = 30;

      const port = (el, dir) => {
        const hw = el.type === 'process' ? 60 : el.type === 'decision-x' ? 50 : el.type === 'system_action' ? 65 : 20;
        const hh = el.type === 'process' ? 30 : el.type === 'decision-x' ? 50 : el.type === 'system_action' ? 25 : 20;
        return dir === 'right' ? {x:el.x+hw,y:el.y} : dir === 'left' ? {x:el.x-hw,y:el.y}
             : dir === 'top'   ? {x:el.x,y:el.y-hh} : {x:el.x,y:el.y+hh};
      };

      const midX = (arrow) => {
        const se = editor.elements.find(e => e.id === arrow.start);
        const ee = editor.elements.find(e => e.id === arrow.end);
        if (!se || !ee) return null;
        if (arrow.waypoints && arrow.waypoints.length > 0) return arrow.waypoints[0].x;
        const sp = port(se, arrow.startDir);
        const ep = port(ee, arrow.endDir);
        const o1 = arrow.startDir==='right'?{x:sp.x+OFF,y:sp.y}:arrow.startDir==='left'?{x:sp.x-OFF,y:sp.y}:arrow.startDir==='top'?{x:sp.x,y:sp.y-OFF}:{x:sp.x,y:sp.y+OFF};
        const o2 = arrow.endDir==='right'?{x:ep.x+OFF,y:ep.y}:arrow.endDir==='left'?{x:ep.x-OFF,y:ep.y}:arrow.endDir==='top'?{x:ep.x,y:ep.y-OFF}:{x:ep.x,y:ep.y+OFF};
        const h1 = arrow.startDir==='left'||arrow.startDir==='right';
        const h2 = arrow.endDir==='left'||arrow.endDir==='right';
        if (h1&&h2) return (o1.x+o2.x)/2;
        if (!h1&&!h2) return o1.x;
        if (h1) return o2.x;
        return o1.x;
      };

      // Find the X of the vertical segment closest to the target (approach segment)
      const approachX = (arrow) => {
        const ee = editor.elements.find(e => e.id === arrow.end);
        if (!ee) return null;
        if (arrow.waypoints && arrow.waypoints.length > 0) {
          // Last waypoint before endpoint
          return arrow.waypoints[arrow.waypoints.length - 1].x;
        }
        // For right/left endDir, the approach offset point is at ep.x ± OFF
        const ep = port(ee, arrow.endDir);
        return arrow.endDir === 'right' ? ep.x + OFF
             : arrow.endDir === 'left'  ? ep.x - OFF
             : ep.x;
      };

      // Group arrows by approach X and target element+direction
      const groups = {};
      editor.arrows.forEach(arrow => {
        const x = approachX(arrow);
        if (x === null) return;
        const key = `${Math.round(x)}:${arrow.end}:${arrow.endDir}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(arrow);
      });

      // For groups with multiple arrows, reassign endPortIndex sequentially
      Object.values(groups).forEach(grp => {
        if (grp.length < 2) return;
        // Sort by source Y so topmost source gets lowest port index
        grp.sort((a,b) => {
          const sa = editor.elements.find(e=>e.id===a.start);
          const sb = editor.elements.find(e=>e.id===b.start);
          return (sa?.y??0) - (sb?.y??0);
        });
        grp.forEach((arrow, i) => { arrow.endPortIndex = i; });
      });
    }

    // Save initial state for undo, then render using app.js pipeline
    editor.saveState();
    editor.render();
    if (Object.keys(userStories).length) renderStoryIcons();

    status.textContent = `Loaded ${csvElements.length} elements, ${csvConnections.length} connections.`;
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    console.error(err);
  }
});

// ── Save diagram ──────────────────────────────────────────────────────────────
document.getElementById('save-btn').addEventListener('click', () => {
  const state = {
    elements: editor.elements,
    arrows:   editor.arrows
  };
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'diagram.json';
  a.click();
  URL.revokeObjectURL(url);
});

// ── Load diagram from JSON ────────────────────────────────────────────────────
document.getElementById('diagram-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await readFile(file);
  const state = JSON.parse(text);
  editor.elements     = state.elements;
  editor.arrows       = state.arrows;
  editor.history      = [];
  editor.historyIndex = -1;
  editor.saveState();
  editor.render();
  if (Object.keys(userStories).length) renderStoryIcons();
  document.getElementById('status').textContent = `Loaded diagram: ${state.elements.length} elements, ${state.arrows.length} arrows.`;
});

// ── Fix Overlaps post-processor ───────────────────────────────────────────────
document.getElementById('fix-btn').addEventListener('click', () => {
  const fixed = fixOverlaps(editor);
  if (fixed) {
    editor.saveState();
    editor.render();
    document.getElementById('status').textContent = 'Overlaps fixed.';
  } else {
    document.getElementById('status').textContent = 'No overlapping segments found.';
  }
});

// ── Register post-render hook once ───────────────────────────────────────────
// Fires after every editor.render() call — keeps colours alive through
// selections, drags, undo/redo without any further changes to app.js
editor.onAfterRender = () => {
  applyArrowColors();
  if (Object.keys(userStories).length) renderStoryIcons();
  renderSubprocessIcon();
  renderSubprocessOnCanvas();
  renderConnectionIcons();
};
