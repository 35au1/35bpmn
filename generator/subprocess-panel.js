// subprocess-panel.js — v3
// Subprocess elements live in editor.elements/arrows (fully editable).
// Overlay (border, titles, toolbar) drawn in onAfterRender.
// Dropping any element onto the subprocess area auto-assigns it.
// Bottom toolbar: add flow, rename flow, delete flow.

// ── Constants ─────────────────────────────────────────────────────────────────
const FLOW_ROW_H  = 260;
const SP_MARGIN   = 120;
const PAD         = 44;
const TITLE_H     = 28;
const ROW_LABEL_W = 28;
const TOOLBAR_H   = 36;

// ── Live state ────────────────────────────────────────────────────────────────
let subprocessVisible  = false;
let subprocessInjected = false;
let spDragState        = null;

// spFlows: array of { id, title }  — runtime flow registry
// Elements carry _spFlowId to know which flow they belong to
let spFlows = [];
let _spFlowSeq = 0;
function newFlowId() { return 'spf_' + (++_spFlowSeq); }

// ── Mock seed data ────────────────────────────────────────────────────────────
const MOCK_SUBPROCESS = {
  processTitle: 'Wprowadzenie danych faktury',
  flows: [
    {
      title: 'Wybór managera',
      nodes: [
        { id: 'sp_s1', type: 'start',   x: 0,   y: 0, label: '' },
        { id: 'sp_p1', type: 'process', x: 220, y: 0, label: 'Wybór managera' },
        { id: 'sp_e1', type: 'end',     x: 440, y: 0, label: '' },
      ],
      edges: [
        { from: 'sp_s1', to: 'sp_p1', startDir: 'right', endDir: 'left', label: '' },
        { from: 'sp_p1', to: 'sp_e1', startDir: 'right', endDir: 'left', label: '' },
      ]
    },
    {
      title: 'Pobranie danych przejazdu',
      nodes: [
        { id: 'sp_s2',  type: 'start',      x: 0,   y: 0,    label: '' },
        { id: 'sp_d1',  type: 'decision-x', x: 220, y: 0,    label: 'Czy użytkownik jest managerem?' },
        { id: 'sp_p2',  type: 'process',    x: 440, y: -100, label: 'Pobranie danych przejazdu' },
        { id: 'sp_e2a', type: 'end',        x: 660, y: -100, label: '' },
        { id: 'sp_e2b', type: 'end',        x: 440, y: 100,  label: '' },
      ],
      edges: [
        { from: 'sp_s2', to: 'sp_d1',  startDir: 'right',  endDir: 'left',   label: '' },
        { from: 'sp_d1', to: 'sp_p2',  startDir: 'top',    endDir: 'left',   label: 'Tak' },
        { from: 'sp_d1', to: 'sp_e2b', startDir: 'bottom', endDir: 'left',   label: 'Nie' },
        { from: 'sp_p2', to: 'sp_e2a', startDir: 'right',  endDir: 'left',   label: '' },
      ]
    },
    {
      title: 'Przesłanie do akceptacji',
      nodes: [
        { id: 'sp_s3', type: 'start',   x: 0,   y: 0, label: 'Wprowadzenie danych faktury' },
        { id: 'sp_p3', type: 'process', x: 220, y: 0, label: 'Przesłanie do akceptacji' },
        { id: 'sp_e3', type: 'end',     x: 440, y: 0, label: 'Akceptacja przez Approvera' },
      ],
      edges: [
        { from: 'sp_s3', to: 'sp_p3', startDir: 'right', endDir: 'left', label: '' },
        { from: 'sp_p3', to: 'sp_e3', startDir: 'right', endDir: 'left', label: '' },
      ]
    }
  ]
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function spMapType(t) {
  return { start: 'start', end: 'end', 'decision-x': 'decision-x', process: 'process' }[t] || 'process';
}

function spOriginX() {
  if (window._diagramFarX) {
    return window._diagramFarX + 3 * 30 + SP_MARGIN + ROW_LABEL_W + PAD;
  }
  let maxX = 300;
  editor.elements.forEach(el => {
    if (!el._subprocess) {
      const hw = el.type === 'process' ? 90 : el.type === 'decision-x' ? 50 : 20;
      if (el.x + hw > maxX) maxX = el.x + hw;
    }
  });
  return maxX + SP_MARGIN + ROW_LABEL_W + PAD;
}

// Bounding box of the subprocess area (content only, no padding)
function spBounds() {
  const spEls = editor.elements.filter(el => el._subprocess);
  if (!spEls.length) return null;
  const allX = spEls.map(el => el.x);
  const allY = spEls.map(el => el.y);
  return {
    minX: Math.min(...allX) - 100 - PAD - ROW_LABEL_W,
    minY: Math.min(...allY) - 60  - PAD - TITLE_H,
    maxX: Math.max(...allX) + 100 + PAD,
    maxY: Math.max(...allY) + 80  + PAD + TOOLBAR_H
  };
}

function pointInSpBounds(x, y) {
  const b = spBounds();
  if (!b) return false;
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
}

// ── Inject mock seed ──────────────────────────────────────────────────────────
function injectSubprocessElements() {
  if (subprocessInjected) return;
  subprocessInjected = true;
  spFlows = [];

  const ox = spOriginX();
  const oy = 80 + TITLE_H + PAD;
  const idMap = {};

  MOCK_SUBPROCESS.flows.forEach((flow, fi) => {
    const fid = newFlowId();
    spFlows.push({ id: fid, title: flow.title });
    const rowCenterY = oy + fi * FLOW_ROW_H;

    flow.nodes.forEach(n => {
      const numId = Date.now() + Math.floor(Math.random() * 1e6);
      idMap[n.id] = numId;
      editor.elements.push({
        id: numId, type: spMapType(n.type),
        x: ox + n.x, y: rowCenterY + n.y,
        title: n.label, expanded: false, subElements: [], minimized: false,
        _subprocess: true, _spFlowId: fid, _spMockId: n.id
      });
    });

    flow.edges.forEach(e => {
      const srcId = idMap[e.from], tgtId = idMap[e.to];
      if (!srcId || !tgtId) return;
      editor.arrows.push({
        id: Date.now() + Math.floor(Math.random() * 1e6),
        start: srcId, end: tgtId,
        startDir: e.startDir, endDir: e.endDir,
        label: e.label || '', waypoints: [],
        startPortIndex: 0, endPortIndex: 0,
        _subprocess: true, _spFlowId: fid
      });
    });
  });
}

function removeSubprocessElements() {
  editor.elements = editor.elements.filter(el => !el._subprocess);
  editor.arrows   = editor.arrows.filter(a  => !a._subprocess);
  subprocessInjected = false;
  spFlows = [];
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function toggleSubprocessPanel() {
  subprocessVisible = !subprocessVisible;
  if (subprocessVisible) injectSubprocessElements();
  else removeSubprocessElements();
  editor.render();
}

// ── Auto-assign dropped elements ──────────────────────────────────────────────
// Called from the patched saveState — checks if any non-subprocess element
// now sits inside the subprocess bounding box and tags it accordingly.
function spCheckDroppedElements() {
  if (!subprocessVisible) return;
  let changed = false;
  editor.elements.forEach(el => {
    if (el._subprocess) return;
    if (pointInSpBounds(el.x, el.y)) {
      el._subprocess = true;
      // Assign to first flow if none specified, or create an "unassigned" flow
      if (!el._spFlowId) {
        let unassigned = spFlows.find(f => f.title === '—');
        if (!unassigned) {
          unassigned = { id: newFlowId(), title: '—' };
          spFlows.push(unassigned);
        }
        el._spFlowId = unassigned.id;
      }
      changed = true;
    }
  });
  if (changed) editor.render();
}

// ── Add / delete flows ────────────────────────────────────────────────────────
function spAddFlow() {
  const title = prompt('Nazwa podprocesu:', 'Nowy podproces');
  if (!title) return;
  const fid = newFlowId();
  spFlows.push({ id: fid, title });

  // Place a start + end placeholder for the new row
  const ox = spOriginX();
  const rowIdx = spFlows.length - 1;
  const oy = 80 + TITLE_H + PAD + rowIdx * FLOW_ROW_H;

  [
    { type: 'start', x: ox,       y: oy, title: '' },
    { type: 'end',   x: ox + 220, y: oy, title: '' },
  ].forEach(n => {
    editor.elements.push({
      id: Date.now() + Math.floor(Math.random() * 1e6),
      type: n.type, x: n.x, y: n.y,
      title: n.title, expanded: false, subElements: [], minimized: false,
      _subprocess: true, _spFlowId: fid
    });
  });

  editor.saveState();
  editor.render();
}

function spDeleteFlow(fid) {
  if (!confirm('Usunąć ten podproces i wszystkie jego elementy?')) return;
  editor.elements = editor.elements.filter(el => el._spFlowId !== fid);
  editor.arrows   = editor.arrows.filter(a  => a._spFlowId !== fid);
  spFlows = spFlows.filter(f => f.id !== fid);
  editor.saveState();
  editor.render();
}

function spRenameFlow(fid) {
  const flow = spFlows.find(f => f.id === fid);
  if (!flow) return;
  const title = prompt('Nowa nazwa:', flow.title);
  if (!title) return;
  flow.title = title;
  editor.render();
}

// ── Overlay ───────────────────────────────────────────────────────────────────
function renderSubprocessOnCanvas() {
  document.querySelector('[data-subprocess-overlay]')?.remove();
  if (!subprocessVisible) return;

  const spEls = editor.elements.filter(el => el._subprocess);
  if (!spEls.length) return;

  const allX = spEls.map(el => el.x);
  const allY = spEls.map(el => el.y);
  const minX = Math.min(...allX) - 100 - PAD - ROW_LABEL_W;
  const minY = Math.min(...allY) - 60  - PAD - TITLE_H;
  const maxX = Math.max(...allX) + 100 + PAD;
  const maxY = Math.max(...allY) + 80  + PAD + TOOLBAR_H;
  const W = maxX - minX;
  const H = maxY - minY;

  const svg = document.getElementById('canvas');
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('data-subprocess-overlay', '1');

  const mk = (tag, attrs) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };

  // Background
  g.appendChild(mk('rect', {
    x: minX, y: minY, width: W, height: H, rx: 8,
    fill: 'rgba(8,8,8,0.75)', stroke: '#2a2a2a',
    'stroke-width': '1.5', 'stroke-dasharray': '6,4'
  }));

  // Title bar
  g.appendChild(mk('rect', { x: minX, y: minY, width: W, height: TITLE_H, rx: 8, fill: '#141414' }));
  const titleTxt = mk('text', { x: minX + 12, y: minY + TITLE_H - 9, 'font-size': '11', fill: '#555' });
  titleTxt.textContent = MOCK_SUBPROCESS.processTitle;
  g.appendChild(titleTxt);

  // Drag handle
  const handle = mk('rect', {
    x: minX, y: minY, width: W, height: TITLE_H,
    fill: 'transparent', cursor: 'move', 'data-sp-drag-handle': '1'
  });
  g.appendChild(handle);

  // Per-flow labels, separators, dotted arrows
  spFlows.forEach((flow, fi) => {
    const flowEls = spEls.filter(el => el._spFlowId === flow.id);
    if (!flowEls.length) return;

    const rowYs  = flowEls.map(el => el.y);
    const rowCY  = (Math.min(...rowYs) + Math.max(...rowYs)) / 2;
    const rowTop = Math.min(...rowYs) - 60;

    if (fi > 0) {
      g.appendChild(mk('line', {
        x1: minX + 8, y1: rowTop - 16, x2: maxX - 8, y2: rowTop - 16,
        stroke: '#1e1e1e', 'stroke-width': '1'
      }));
    }

    // Vertical label
    const labelX = minX + ROW_LABEL_W - 6;
    const lbl = mk('text', {
      x: labelX, y: rowCY, 'font-size': '9', fill: '#444',
      'text-anchor': 'middle', transform: `rotate(-90, ${labelX}, ${rowCY})`
    });
    lbl.textContent = flow.title.toUpperCase();
    g.appendChild(lbl);

    // Delete button per row (×)
    const delBtnX = maxX - 18, delBtnY = rowCY - 8;
    const delBtn = mk('text', {
      x: delBtnX, y: delBtnY + 12, 'font-size': '11', fill: '#333',
      'text-anchor': 'middle', cursor: 'pointer'
    });
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', e => { e.stopPropagation(); spDeleteFlow(flow.id); });
    delBtn.addEventListener('mouseenter', () => delBtn.setAttribute('fill', '#888'));
    delBtn.addEventListener('mouseleave', () => delBtn.setAttribute('fill', '#333'));
    g.appendChild(delBtn);

    // Rename on label click
    lbl.style.cursor = 'pointer';
    lbl.addEventListener('click', e => { e.stopPropagation(); spRenameFlow(flow.id); });

    // Dotted arrows for labelled start/end nodes
    flowEls.forEach(el => {
      const mockNode = MOCK_SUBPROCESS.flows
        .flatMap(f => f.nodes)
        .find(n => n.id === el._spMockId);
      const label = mockNode?.label || el.title;
      if (!label) return;

      if (el.type === 'end') {
        const ax = el.x + 28, ay = el.y;
        g.appendChild(mk('line', { x1: ax, y1: ay, x2: ax+28, y2: ay, stroke: '#555', 'stroke-width': '1.5', 'stroke-dasharray': '3,3' }));
        g.appendChild(mk('polygon', { points: `${ax+28},${ay} ${ax+20},${ay-5} ${ax+20},${ay+5}`, fill: '#555', stroke: '#555', 'stroke-width': '1' }));
      }
      if (el.type === 'start') {
        const ax = el.x - 28, ay = el.y;
        g.appendChild(mk('line', { x1: ax-28, y1: ay, x2: ax, y2: ay, stroke: '#555', 'stroke-width': '1.5', 'stroke-dasharray': '3,3' }));
        g.appendChild(mk('polygon', { points: `${ax},${ay} ${ax-8},${ay-5} ${ax-8},${ay+5}`, fill: '#555', stroke: '#555', 'stroke-width': '1' }));
      }
    });
  });

  // ── Bottom toolbar ──
  const tbY = maxY - TOOLBAR_H;
  g.appendChild(mk('rect', { x: minX, y: tbY, width: W, height: TOOLBAR_H, rx: 4, fill: '#0e0e0e' }));

  // "＋ Dodaj podproces" button
  const addBtn = mk('text', {
    x: minX + 16, y: tbY + 22, 'font-size': '11', fill: '#555', cursor: 'pointer'
  });
  addBtn.textContent = '＋  Dodaj podproces';
  addBtn.addEventListener('click', e => { e.stopPropagation(); spAddFlow(); });
  addBtn.addEventListener('mouseenter', () => addBtn.setAttribute('fill', '#aaa'));
  addBtn.addEventListener('mouseleave', () => addBtn.setAttribute('fill', '#555'));
  g.appendChild(addBtn);

  // Insert behind bpmn-elements
  const firstEl = svg.querySelector('.bpmn-element');
  if (firstEl) svg.insertBefore(g, firstEl);
  else svg.appendChild(g);

  handle.addEventListener('mousedown', spDragStart);
}

// ── Group drag ────────────────────────────────────────────────────────────────
function spDragStart(e) {
  e.stopPropagation(); e.preventDefault();
  const rect = document.getElementById('canvas').getBoundingClientRect();
  const cont = document.getElementById('canvas').parentElement;
  spDragState = {
    startX: e.clientX - rect.left + cont.scrollLeft,
    startY: e.clientY - rect.top  + cont.scrollTop,
    origPositions: editor.elements.filter(el => el._subprocess).map(el => ({ id: el.id, x: el.x, y: el.y }))
  };
  window.addEventListener('mousemove', spDragMove);
  window.addEventListener('mouseup',   spDragEnd);
}

function spDragMove(e) {
  if (!spDragState) return;
  const rect = document.getElementById('canvas').getBoundingClientRect();
  const cont = document.getElementById('canvas').parentElement;
  const dx = (e.clientX - rect.left + cont.scrollLeft) - spDragState.startX;
  const dy = (e.clientY - rect.top  + cont.scrollTop)  - spDragState.startY;
  spDragState.origPositions.forEach(({ id, x, y }) => {
    const el = editor.elements.find(e => e.id === id);
    if (el) { el.x = x + dx; el.y = y + dy; }
  });
  editor.render();
}

function spDragEnd() {
  if (spDragState) { editor.saveState(); spDragState = null; }
  window.removeEventListener('mousemove', spDragMove);
  window.removeEventListener('mouseup',   spDragEnd);
}

// ── Patch saveState to detect drops into subprocess area ─────────────────────
const _origSaveState = BPMNEditor.prototype.saveState;
BPMNEditor.prototype.saveState = function() {
  spCheckDroppedElements();
  return _origSaveState.call(this);
};

// ── Block cross-connections ───────────────────────────────────────────────────
const _origAddArrow = BPMNEditor.prototype.addArrow;
BPMNEditor.prototype.addArrow = function(startId, endId, startDir, endDir) {
  const s = this.elements.find(el => el.id === startId);
  const t = this.elements.find(el => el.id === endId);
  if (s && t && !!s._subprocess !== !!t._subprocess) return;
  return _origAddArrow.call(this, startId, endId, startDir, endDir);
};
