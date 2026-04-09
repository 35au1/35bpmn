class BPMNEditor {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.elements = [];
        this.arrows = [];
        this.selectedElement = null;
        this.selectedArrow = null;
        this.isDragging = false;
        this.isDrawingArrow = false;
        this.isDraggingArrow = false;
        this.isDraggingArrowhead = false;
        this.isDraggingArrowStart = false;
        this.isDraggingSegment = false;
        this.draggedSegmentIndex = null;
        this.arrowStart = null;
        this.arrowStartPoint = null;
        this.nearbyConnectionPoint = null;
        this.tempArrowLine = null;
        this.expandedProcesses = new Set();
        this.history = [];
        this.historyIndex = -1;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadTheme();
    }

    setupEventListeners() {
        // Theme toggle
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('expand-all').addEventListener('click', () => this.expandAll());
        document.getElementById('collapse-all').addEventListener('click', () => this.collapseAll());

        // Palette items
        document.querySelectorAll('.palette-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                if (type !== 'arrow') {
                    this.addElement(type, 200, 200);
                }
            });
        });

        // Canvas interactions
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    handleKeyDown(e) {
        // Undo: Ctrl+Z
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            this.undo();
        }
        // Redo: Ctrl+Shift+Z or Ctrl+Y
        else if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
            e.preventDefault();
            this.redo();
        }
        // Delete selected arrow
        else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedArrow) {
            e.preventDefault();
            this.deleteArrow(this.selectedArrow);
        }
    }

    saveState() {
        // Remove any states after current index
        this.history = this.history.slice(0, this.historyIndex + 1);
        
        // Save current state
        const state = {
            elements: JSON.parse(JSON.stringify(this.elements)),
            arrows: JSON.parse(JSON.stringify(this.arrows))
        };
        this.history.push(state);
        this.historyIndex++;
        
        // Limit history to 50 states
        if (this.history.length > 50) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    restoreState(state) {
        this.elements = JSON.parse(JSON.stringify(state.elements));
        this.arrows = JSON.parse(JSON.stringify(state.arrows));
        this.render();
    }

    toggleTheme() {
        const current = document.body.dataset.theme;
        document.body.dataset.theme = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', document.body.dataset.theme);
    }

    loadTheme() {
        const saved = localStorage.getItem('theme') || 'light';
        document.body.dataset.theme = saved;
    }

    addElement(type, x, y) {
        this.saveState();
        
        const element = {
            id: Date.now(),
            type: type,
            x: x,
            y: y,
            title: this.getDefaultTitle(type),
            expanded: false,
            subElements: [],
            minimized: type === 'comment'
        };
        
        this.elements.push(element);
        this.render();
    }

    getDefaultTitle(type) {
        const titles = {
            'start': 'Start',
            'end': 'End',
            'process': 'Process',
            'decision-x': 'Decision X',
            'decision-plus': 'Decision +',
            'comment': 'Comment',
            'external': 'External'
        };
        return titles[type] || 'Element';
    }

    renderElement(element) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('bpmn-element');
        g.dataset.id = element.id;

        if (this.expandedProcesses.has(element.id) && element.type === 'process') {
            g.classList.add('expanded-process');
        }

        switch(element.type) {
            case 'start':
                this.renderStart(g, element);
                break;
            case 'end':
                this.renderEnd(g, element);
                break;
            case 'process':
                this.renderProcess(g, element);
                break;
            case 'decision-x':
                this.renderDecisionX(g, element);
                break;
            case 'decision-plus':
                this.renderDecisionPlus(g, element);
                break;
            case 'comment':
                this.renderComment(g, element);
                break;
            case 'external':
                this.renderExternal(g, element);
                break;
            case 'system_action':
                this.renderSystemAction(g, element);
                break;
        }

        // Add connection points
        this.addConnectionPoints(g, element);

        return g;
    }

    addConnectionPoints(g, element) {
        const points = this.getConnectionPoints(element);
        const sidesRendered = new Set();

        points.forEach((point) => {
            const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            anchor.setAttribute('x', point.x - 4);
            anchor.setAttribute('y', point.y - 4);
            anchor.setAttribute('width', 8);
            anchor.setAttribute('height', 8);
            anchor.classList.add('connection-point');
            anchor.dataset.elementId = element.id;
            anchor.dataset.direction = point.direction;
            anchor.dataset.portIndex = point.portIndex;
            g.appendChild(anchor);
        });

        // ONE "+" button per side, shown on hover, positioned at the edge midpoint
        ['top','right','bottom','left'].forEach(dir => {
            const sidePts = points.filter(p => p.direction === dir);
            if (sidePts.length === 0) return;
            // Place + at the last point on this side + small offset
            const last = sidePts[sidePts.length - 1];
            const offX = dir === 'right' ? 14 : dir === 'left' ? -14 : 0;
            const offY = dir === 'bottom' ? 14 : dir === 'top' ? -14 : 0;
            const btn = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            btn.setAttribute('x', last.x + offX);
            btn.setAttribute('y', last.y + offY + 4);
            btn.setAttribute('font-size', '13');
            btn.setAttribute('fill', '#4CAF50');
            btn.setAttribute('cursor', 'pointer');
            btn.setAttribute('text-anchor', 'middle');
            btn.classList.add('add-port-btn');
            btn.dataset.elementId = element.id;
            btn.dataset.direction = dir;
            btn.textContent = '+';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.addExtraPort(parseInt(btn.dataset.elementId), btn.dataset.direction);
            });
            g.appendChild(btn);
        });
    }

    addExtraPort(elementId, direction) {
        const el = this.elements.find(e => e.id === elementId);
        if (!el) return;
        if (!el.extraPorts) el.extraPorts = {};
        el.extraPorts[direction] = (el.extraPorts[direction] || 1) + 1;
        this.saveState();
        this.render();
    }

    getPortsForDirection(element, direction, edgeX, edgeY, isHorizontal) {
        const SPREAD = 14;
        // Count arrows on this direction
        const arrowCount = this.arrows.filter(a =>
            (a.end === element.id && a.endDir === direction) ||
            (a.start === element.id && a.startDir === direction)
        ).length;
        const count = Math.max(1, arrowCount + (element.extraPorts?.[direction] || 0));
        const ports = [];
        for (let i = 0; i < count; i++) {
            const offset = (i - (count - 1) / 2) * SPREAD;
            ports.push({
                x: isHorizontal ? edgeX : edgeX + offset,
                y: isHorizontal ? edgeY + offset : edgeY,
                direction,
                portIndex: i
            });
        }
        return ports;
    }

    getConnectionPoints(element) {
        const points = [];

        if (element.type === 'process') {
            const hw = 90, hh = this.getElementHalfHeight(element);
            points.push(...this.getPortsForDirection(element, 'top',    element.x,      element.y - hh, false));
            points.push(...this.getPortsForDirection(element, 'right',  element.x + hw, element.y,      true));
            points.push(...this.getPortsForDirection(element, 'bottom', element.x,      element.y + hh, false));
            points.push(...this.getPortsForDirection(element, 'left',   element.x - hw, element.y,      true));
            return points;
        }

        if (element.type === 'system_action') {
            points.push(...this.getPortsForDirection(element, 'top',    element.x,      element.y - 25, false));
            points.push(...this.getPortsForDirection(element, 'right',  element.x + 65, element.y,      true));
            points.push(...this.getPortsForDirection(element, 'bottom', element.x,      element.y + 25, false));
            points.push(...this.getPortsForDirection(element, 'left',   element.x - 65, element.y,      true));
            return points;
        }

        let offset = 0;
        switch(element.type) {
            case 'start': case 'end':   offset = 20; break;
            case 'decision-x': case 'decision-plus': offset = 50; break;
            case 'comment': offset = element.minimized ? 15 : 30; break;
            case 'external': offset = 10; break;
            default: offset = 30;
        }

        points.push(...this.getPortsForDirection(element, 'top',    element.x,          element.y - offset, false));
        points.push(...this.getPortsForDirection(element, 'right',  element.x + offset, element.y,          true));
        points.push(...this.getPortsForDirection(element, 'bottom', element.x,          element.y + offset, false));
        points.push(...this.getPortsForDirection(element, 'left',   element.x - offset, element.y,          true));
        return points;
    }

    renderStart(g, element) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', element.x);
        circle.setAttribute('cy', element.y);
        circle.setAttribute('r', 20);
        circle.classList.add('start-element');
        g.appendChild(circle);

        // Play icon
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${element.x - 6} ${element.y - 8} L ${element.x + 8} ${element.y} L ${element.x - 6} ${element.y + 8} Z`);
        path.setAttribute('fill', 'var(--text-color)');
        g.appendChild(path);

        this.addText(g, element.x, element.y + 35, element.title);
    }

    renderEnd(g, element) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', element.x);
        circle.setAttribute('cy', element.y);
        circle.setAttribute('r', 20);
        circle.classList.add('end-element');
        g.appendChild(circle);

        // Stop icon (square)
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', element.x - 8);
        rect.setAttribute('y', element.y - 8);
        rect.setAttribute('width', 16);
        rect.setAttribute('height', 16);
        rect.setAttribute('fill', 'var(--text-color)');
        g.appendChild(rect);

        this.addText(g, element.x, element.y + 35, element.title);
    }

    getElementHalfHeight(element) {
        const SPREAD = 14, MIN_H = 30, PORT_PAD = 20;
        const countDir = (dir) => Math.max(1,
            (element.extraPorts?.[dir] || 0) +
            this.arrows.filter(a =>
                (a.end === element.id && a.endDir === dir) ||
                (a.start === element.id && a.startDir === dir)
            ).length
        );
        const maxSideCount = Math.max(countDir('left'), countDir('right'), 1);
        return Math.max(MIN_H, Math.ceil((maxSideCount - 1) * SPREAD / 2) + PORT_PAD);
    }

    renderProcess(g, element) {
        const width = 180;
        const height = this.getElementHalfHeight(element) * 2;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', element.x - width/2);
        rect.setAttribute('y', element.y - height/2);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        rect.setAttribute('rx', 5);
        rect.classList.add('process-box');
        g.appendChild(rect);

        this.addText(g, element.x, element.y, element.title);
    }

    renderDecisionX(g, element) {
        const size = 50;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${element.x} ${element.y - size} L ${element.x + size} ${element.y} L ${element.x} ${element.y + size} L ${element.x - size} ${element.y} Z`);
        path.classList.add('decision-box');
        g.appendChild(path);

        // X mark
        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line1.setAttribute('x1', element.x - 10);
        line1.setAttribute('y1', element.y - 10);
        line1.setAttribute('x2', element.x + 10);
        line1.setAttribute('y2', element.y + 10);
        line1.setAttribute('stroke', 'var(--text-color)');
        line1.setAttribute('stroke-width', 2);
        g.appendChild(line1);

        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', element.x + 10);
        line2.setAttribute('y1', element.y - 10);
        line2.setAttribute('x2', element.x - 10);
        line2.setAttribute('y2', element.y + 10);
        line2.setAttribute('stroke', 'var(--text-color)');
        line2.setAttribute('stroke-width', 2);
        g.appendChild(line2);

        this.addText(g, element.x, element.y + 65, element.title);
    }

    renderDecisionPlus(g, element) {
        const size = 50;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${element.x} ${element.y - size} L ${element.x + size} ${element.y} L ${element.x} ${element.y + size} L ${element.x - size} ${element.y} Z`);
        path.classList.add('decision-box');
        g.appendChild(path);

        // + mark
        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line1.setAttribute('x1', element.x - 12);
        line1.setAttribute('y1', element.y);
        line1.setAttribute('x2', element.x + 12);
        line1.setAttribute('y2', element.y);
        line1.setAttribute('stroke', 'var(--text-color)');
        line1.setAttribute('stroke-width', 2);
        g.appendChild(line1);

        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', element.x);
        line2.setAttribute('y1', element.y - 12);
        line2.setAttribute('x2', element.x);
        line2.setAttribute('y2', element.y + 12);
        line2.setAttribute('stroke', 'var(--text-color)');
        line2.setAttribute('stroke-width', 2);
        g.appendChild(line2);

        this.addText(g, element.x, element.y + 65, element.title);
    }

    renderComment(g, element) {
        if (element.minimized) {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', element.x);
            circle.setAttribute('cy', element.y);
            circle.setAttribute('r', 15);
            circle.classList.add('comment-box');
            g.appendChild(circle);

            this.addText(g, element.x, element.y + 5, 'i');
        } else {
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', element.x - 50);
            rect.setAttribute('y', element.y - 30);
            rect.setAttribute('width', 100);
            rect.setAttribute('height', 60);
            rect.setAttribute('rx', 3);
            rect.classList.add('comment-box');
            g.appendChild(rect);

            this.addText(g, element.x, element.y, element.title);
        }
    }

    renderExternal(g, element) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', element.x);
        circle.setAttribute('cy', element.y);
        circle.setAttribute('r', 10);
        circle.classList.add('external-dot');
        g.appendChild(circle);
        this.addText(g, element.x, element.y + 25, element.title);
    }

    renderSystemAction(g, element) {
        const w = 130, h = 50, skew = 25;
        const x = element.x, y = element.y;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x-w/2+skew} ${y-h/2} L ${x+w/2+skew} ${y-h/2} L ${x+w/2-skew} ${y+h/2} L ${x-w/2-skew} ${y+h/2} Z`);
        path.classList.add('process-box');
        g.appendChild(path);
        this.addText(g, x, y, element.title);
    }

    addText(g, x, y, text) {
        const MAX_CHARS = 22;
        const LINE_H = 14;
        const words = (text || '').split(' ');
        const lines = [];
        let line = '';
        words.forEach(w => {
            const test = line ? line + ' ' + w : w;
            if (test.length > MAX_CHARS && line) { lines.push(line); line = w; }
            else line = test;
        });
        if (line) lines.push(line);

        const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textEl.setAttribute('x', x);
        textEl.setAttribute('y', y);
        textEl.classList.add('element-text');

        const startY = -((lines.length - 1) * LINE_H) / 2;
        lines.forEach((l, i) => {
            const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            tspan.setAttribute('x', x);
            tspan.setAttribute('dy', i === 0 ? startY : LINE_H);
            tspan.textContent = l;
            textEl.appendChild(tspan);
        });

        g.appendChild(textEl);
    }

    startDrawingArrow() {
        this.isDrawingArrow = true;
        this.arrowStart = null;
        this.arrowStartPoint = null;
        this.tempArrowLine = null;
        this.isDraggingArrow = false;
        // Add arrow mode class to canvas
        this.canvas.classList.add('arrow-mode');
        console.log('Arrow drawing mode activated');
    }

    handleMouseDown(e) {
        // Check if clicking on segment handle
        if (e.target.classList.contains('segment-handle')) {
            const arrowId = parseInt(e.target.dataset.arrowId);
            const segmentIndex = parseInt(e.target.dataset.segmentIndex);
            this.selectedArrow = arrowId;
            this.isDraggingSegment = true;
            this.draggedSegmentIndex = segmentIndex;
            this.segmentIsHorizontal = e.target.dataset.isHorizontal === 'true';
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        
        // Check if clicking on arrowhead when arrow is selected
        if (e.target.classList.contains('arrowhead-draggable') && this.selectedArrow) {
            const arrowId = parseInt(e.target.dataset.arrowId);
            if (arrowId === this.selectedArrow) {
                this.isDraggingArrowhead = true;
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
        
        // Check if clicking on arrow start point when arrow is selected
        if (e.target.classList.contains('arrowstart-draggable') && this.selectedArrow) {
            const arrowId = parseInt(e.target.dataset.arrowId);
            if (arrowId === this.selectedArrow) {
                this.isDraggingArrowStart = true;
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
        
        // Check if clicking on arrow path
        if (e.target.classList.contains('arrow-path')) {
            const arrowId = parseInt(e.target.dataset.arrowId);
            this.selectedArrow = arrowId;
            this.render();
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        
        // Check if clicking on connection point - ALWAYS allow arrow drawing
        if (e.target.classList.contains('connection-point')) {
            const elementId = parseInt(e.target.dataset.elementId);
            const direction = e.target.dataset.direction;
            
            // Start dragging arrow
            this.arrowStart = elementId;
            this.arrowStartPoint = direction;
            this.arrowStartElement = e.target;
            this.isDraggingArrow = true;
            this.nearbyConnectionPoint = null;
            e.target.classList.add('selected-point');
            
            // Get start position
            const element = this.elements.find(el => el.id === elementId);
            const points = this.getConnectionPoints(element);
            this.arrowStartPos = points.find(p => p.direction === direction);
            
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // Deselect arrow if clicking on element or canvas
        const target = e.target.closest('.bpmn-element');
        if (target || e.target.id === 'canvas') {
            this.selectedArrow = null;
            this.render();
        }

        if (target && !this.isDraggingArrow) {
            // Don't drag if clicking on connection point
            if (!e.target.classList.contains('connection-point')) {
                this.selectedElement = target;
                this.isDragging = true;
            }
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left + this.canvas.parentElement.scrollLeft;
        const currentY = e.clientY - rect.top + this.canvas.parentElement.scrollTop;
        
        if (this.isDragging && this.selectedElement) {
            const id = parseInt(this.selectedElement.dataset.id);
            const element = this.elements.find(el => el.id === id);
            if (element) {
                element.x = currentX;
                element.y = currentY;
                // Render to update arrows automatically
                this.render();
            }
        } else if (this.isDraggingSegment) {
            // Drag segment - corners stay FIXED, insert new segments to bridge
            const arrow = this.arrows.find(a => a.id === this.selectedArrow);
            if (!arrow) return;
            
            // Initialize waypoints from calculated route if needed
            if (!arrow.waypoints || arrow.waypoints.length === 0) {
                const startEl = this.elements.find(el => el.id === arrow.start);
                const endEl = this.elements.find(el => el.id === arrow.end);
                const startPoint = this.getConnectionPoints(startEl).find(p => p.direction === arrow.startDir);
                const endPoint = this.getConnectionPoints(endEl).find(p => p.direction === arrow.endDir);
                const routedPath = this.calculateOrthogonalRoute(startPoint, endPoint, arrow.startDir, arrow.endDir, startEl, endEl);
                arrow.waypoints = routedPath.slice(1, -1).map(p => ({x: p.x, y: p.y}));
            }
            
            const segIdx = this.draggedSegmentIndex;
            const startEl = this.elements.find(el => el.id === arrow.start);
            const endEl = this.elements.find(el => el.id === arrow.end);
            const startPoint = this.getConnectionPoints(startEl).find(p => p.direction === arrow.startDir);
            const endPoint = this.getConnectionPoints(endEl).find(p => p.direction === arrow.endDir);
            
            // Build full path with start and end
            const fullPath = [startPoint, ...arrow.waypoints, endPoint];
            
            if (segIdx < 0 || segIdx >= fullPath.length - 1) return;
            
            const p1 = fullPath[segIdx];      // Start of segment being dragged
            const p2 = fullPath[segIdx + 1];  // End of segment being dragged
            
            if (this.segmentIsHorizontal) {
                // Dragging horizontal segment up/down
                const newY = currentY;
                
                if (segIdx === 0) {
                    // First segment - from start point
                    // Insert: (p1.x, newY), (p2.x, newY) at beginning
                    arrow.waypoints = [
                        {x: p1.x, y: newY},
                        {x: p2.x, y: newY},
                        ...arrow.waypoints.slice(1)
                    ];
                } else if (segIdx === fullPath.length - 2) {
                    // Last segment - to end point
                    // Insert: (p1.x, newY), (p2.x, newY) at end
                    arrow.waypoints = [
                        ...arrow.waypoints.slice(0, -1),
                        {x: p1.x, y: newY},
                        {x: p2.x, y: newY}
                    ];
                } else {
                    // Middle segment - just update Y of both endpoints
                    arrow.waypoints[segIdx - 1] = {x: p1.x, y: newY};
                    arrow.waypoints[segIdx] = {x: p2.x, y: newY};
                }
                
            } else {
                // Dragging vertical segment left/right
                const newX = currentX;
                
                if (segIdx === 0) {
                    // First segment - from start point
                    arrow.waypoints = [
                        {x: newX, y: p1.y},
                        {x: newX, y: p2.y},
                        ...arrow.waypoints.slice(1)
                    ];
                } else if (segIdx === fullPath.length - 2) {
                    // Last segment - to end point
                    arrow.waypoints = [
                        ...arrow.waypoints.slice(0, -1),
                        {x: newX, y: p1.y},
                        {x: newX, y: p2.y}
                    ];
                } else {
                    // Middle segment - just update X of both endpoints
                    arrow.waypoints[segIdx - 1] = {x: newX, y: p1.y};
                    arrow.waypoints[segIdx] = {x: newX, y: p2.y};
                }
            }
            
            this.render();
        } else if (this.isDraggingArrowhead) {
            // Show temporary line from arrow to cursor
            const arrow = this.arrows.find(a => a.id === this.selectedArrow);
            if (arrow) {
                const startEl = this.elements.find(el => el.id === arrow.start);
                const startPoints = this.getConnectionPoints(startEl);
                const startPoint = startPoints.find(p => p.direction === arrow.startDir);
                
                this.drawTempArrow(startPoint.x, startPoint.y, currentX, currentY);
                
                // Find nearby connection point
                let nearestPoint = null;
                let nearestDist = 30;
                
                document.querySelectorAll('.connection-point').forEach(el => {
                    const pointX = parseFloat(el.getAttribute('x')) + 4;
                    const pointY = parseFloat(el.getAttribute('y')) + 4;
                    const dist = Math.sqrt(Math.pow(currentX - pointX, 2) + Math.pow(currentY - pointY, 2));
                    
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestPoint = el;
                    }
                });
                
                // Highlight nearby connection point
                document.querySelectorAll('.connection-point').forEach(el => {
                    if (el === nearestPoint) {
                        el.style.opacity = '1';
                        el.style.fill = '#FFD700';
                        el.style.strokeWidth = '3';
                    } else {
                        el.style.opacity = '0.6';
                        el.style.fill = '';
                        el.style.strokeWidth = '';
                    }
                });
                
                this.nearbyConnectionPoint = nearestPoint;
            }
        } else if (this.isDraggingArrowStart) {
            // Show temporary line from cursor to arrow end
            const arrow = this.arrows.find(a => a.id === this.selectedArrow);
            if (arrow) {
                const endEl = this.elements.find(el => el.id === arrow.end);
                const endPoints = this.getConnectionPoints(endEl);
                const endPoint = endPoints.find(p => p.direction === arrow.endDir);
                
                this.drawTempArrow(currentX, currentY, endPoint.x, endPoint.y);
                
                // Find nearby connection point
                let nearestPoint = null;
                let nearestDist = 30;
                
                document.querySelectorAll('.connection-point').forEach(el => {
                    const pointX = parseFloat(el.getAttribute('x')) + 4;
                    const pointY = parseFloat(el.getAttribute('y')) + 4;
                    const dist = Math.sqrt(Math.pow(currentX - pointX, 2) + Math.pow(currentY - pointY, 2));
                    
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestPoint = el;
                    }
                });
                
                // Highlight nearby connection point
                document.querySelectorAll('.connection-point').forEach(el => {
                    if (el === nearestPoint) {
                        el.style.opacity = '1';
                        el.style.fill = '#FFD700';
                        el.style.strokeWidth = '3';
                    } else {
                        el.style.opacity = '0.6';
                        el.style.fill = '';
                        el.style.strokeWidth = '';
                    }
                });
                
                this.nearbyConnectionPoint = nearestPoint;
            }
        } else if (this.isDraggingArrow && this.arrowStart && this.arrowStartPos) {
            // Draw temporary arrow line
            this.drawTempArrow(this.arrowStartPos.x, this.arrowStartPos.y, currentX, currentY);
            
            // Find nearby connection point (within 30px)
            let nearestPoint = null;
            let nearestDist = 30;
            
            document.querySelectorAll('.connection-point').forEach(el => {
                if (el !== this.arrowStartElement) {
                    const pointX = parseFloat(el.getAttribute('x')) + 4;
                    const pointY = parseFloat(el.getAttribute('y')) + 4;
                    const dist = Math.sqrt(Math.pow(currentX - pointX, 2) + Math.pow(currentY - pointY, 2));
                    
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestPoint = el;
                    }
                }
            });
            
            // Highlight nearby connection point
            document.querySelectorAll('.connection-point').forEach(el => {
                if (el !== this.arrowStartElement) {
                    if (el === nearestPoint) {
                        el.style.opacity = '1';
                        el.style.fill = '#FFD700';
                        el.style.strokeWidth = '3';
                    } else {
                        el.style.opacity = '0.6';
                        el.style.fill = '';
                        el.style.strokeWidth = '';
                    }
                }
            });
            
            this.nearbyConnectionPoint = nearestPoint;
        }
    }

    drawTempArrow(x1, y1, x2, y2) {
        this.removeTempArrow();
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        
        // Simple path following mouse
        let d;
        if (this.arrowStartPoint === 'right' || this.arrowStartPoint === 'left') {
            d = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
        } else {
            d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
        }
        
        path.setAttribute('d', d);
        path.setAttribute('stroke', 'var(--arrow-color)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '5,5');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.6');
        path.setAttribute('id', 'temp-arrow');
        
        this.canvas.appendChild(path);
        this.tempArrowLine = path;
    }

    removeTempArrow() {
        if (this.tempArrowLine) {
            this.tempArrowLine.remove();
            this.tempArrowLine = null;
        }
    }

    handleMouseUp(e) {
        // Save state after dragging segment
        if (this.isDraggingSegment) {
            this.saveState();
            this.isDraggingSegment = false;
            this.draggedSegmentIndex = null;
            this.segmentIsHorizontal = null;
            return;
        }
        
        // Check if releasing arrowhead on a connection point
        if (this.isDraggingArrowhead) {
            let targetPoint = null;
            
            if (this.nearbyConnectionPoint) {
                targetPoint = this.nearbyConnectionPoint;
            } else if (e.target.classList.contains('connection-point')) {
                targetPoint = e.target;
            }
            
            if (targetPoint) {
                const elementId = parseInt(targetPoint.dataset.elementId);
                const direction = targetPoint.dataset.direction;
                
                // Update the arrow's end point
                const arrow = this.arrows.find(a => a.id === this.selectedArrow);
                if (arrow) {
                    this.saveState();
                    arrow.end = elementId;
                    arrow.endDir = direction;
                    arrow.waypoints = []; // Reset waypoints when reconnecting
                    this.render();
                }
            }
            
            // Clean up
            document.querySelectorAll('.connection-point').forEach(el => {
                el.style.opacity = '';
                el.style.fill = '';
                el.style.strokeWidth = '';
            });
            this.removeTempArrow();
            this.isDraggingArrowhead = false;
            this.nearbyConnectionPoint = null;
            return;
        }
        
        // Check if releasing arrow start on a connection point
        if (this.isDraggingArrowStart) {
            let targetPoint = null;
            
            if (this.nearbyConnectionPoint) {
                targetPoint = this.nearbyConnectionPoint;
            } else if (e.target.classList.contains('connection-point')) {
                targetPoint = e.target;
            }
            
            if (targetPoint) {
                const elementId = parseInt(targetPoint.dataset.elementId);
                const direction = targetPoint.dataset.direction;
                
                // Update the arrow's start point
                const arrow = this.arrows.find(a => a.id === this.selectedArrow);
                if (arrow) {
                    this.saveState();
                    arrow.start = elementId;
                    arrow.startDir = direction;
                    arrow.waypoints = []; // Reset waypoints when reconnecting
                    this.render();
                }
            }
            
            // Clean up
            document.querySelectorAll('.connection-point').forEach(el => {
                el.style.opacity = '';
                el.style.fill = '';
                el.style.strokeWidth = '';
            });
            this.removeTempArrow();
            this.isDraggingArrowStart = false;
            this.nearbyConnectionPoint = null;
            return;
        }
        
        // Check if releasing near a connection point while dragging arrow
        if (this.isDraggingArrow) {
            let targetPoint = null;
            
            // Check if we have a nearby connection point
            if (this.nearbyConnectionPoint) {
                targetPoint = this.nearbyConnectionPoint;
            } else if (e.target.classList.contains('connection-point')) {
                targetPoint = e.target;
            }
            
            if (targetPoint) {
                const elementId = parseInt(targetPoint.dataset.elementId);
                const direction = targetPoint.dataset.direction;
                
                // Create the arrow
                this.addArrow(this.arrowStart, elementId, this.arrowStartPoint, direction);
            }
            
            // Clean up
            document.querySelectorAll('.selected-point').forEach(el => el.classList.remove('selected-point'));
            document.querySelectorAll('.connection-point').forEach(el => {
                el.style.opacity = '';
                el.style.fill = '';
                el.style.transform = '';
            });
            this.removeTempArrow();
            this.arrowStart = null;
            this.arrowStartPoint = null;
            this.arrowStartPos = null;
            this.isDraggingArrow = false;
            this.nearbyConnectionPoint = null;
        }
        
        // Save state after dragging element
        if (this.isDragging) {
            this.saveState();
        }
        
        this.isDragging = false;
        this.selectedElement = null;
    }

    addArrow(startId, endId, startDir, endDir) {
        this.saveState();
        
        const arrow = {
            id: Date.now(),
            start: startId,
            end: endId,
            startDir: startDir,
            endDir: endDir,
            label: 'Button',
            waypoints: [] // Custom waypoints for manual adjustment
        };
        this.arrows.push(arrow);
        this.render();
    }

    deleteArrow(arrowId) {
        this.saveState();
        this.arrows = this.arrows.filter(a => a.id !== arrowId);
        this.selectedArrow = null;
        this.render();
    }

    calculateOrthogonalRoute(start, end, startDir, endDir, startEl, endEl) {
        const path = [];
        const offset = 30;
        
        // Determine if directions are horizontal or vertical
        const isStartHorizontal = (startDir === 'left' || startDir === 'right');
        const isEndHorizontal = (endDir === 'left' || endDir === 'right');
        
        // OFFSET SEGMENT 1: Start at connection point
        path.push({ x: start.x, y: start.y, isOffset: true });
        
        // OFFSET SEGMENT 1: First offset point - move away from start element (ALWAYS FIXED)
        let offsetStart;
        if (startDir === 'right') offsetStart = { x: start.x + offset, y: start.y, isOffset: true };
        else if (startDir === 'left') offsetStart = { x: start.x - offset, y: start.y, isOffset: true };
        else if (startDir === 'top') offsetStart = { x: start.x, y: start.y - offset, isOffset: true };
        else if (startDir === 'bottom') offsetStart = { x: start.x, y: start.y + offset, isOffset: true };
        path.push(offsetStart);
        
        // OFFSET SEGMENT 2: Last offset point - approach end element (ALWAYS FIXED)
        let offsetEnd;
        if (endDir === 'right') offsetEnd = { x: end.x + offset, y: end.y, isOffset: true };
        else if (endDir === 'left') offsetEnd = { x: end.x - offset, y: end.y, isOffset: true };
        else if (endDir === 'top') offsetEnd = { x: end.x, y: end.y - offset, isOffset: true };
        else if (endDir === 'bottom') offsetEnd = { x: end.x, y: end.y + offset, isOffset: true };
        
        // ROUTING SEGMENTS: Route between offsetStart and offsetEnd with 90-degree turns
        if (isStartHorizontal && isEndHorizontal) {
            // H -> V -> H
            // midX must stay between the two offset points (never outside them)
            const leftX  = Math.min(offsetStart.x, offsetEnd.x);
            const rightX = Math.max(offsetStart.x, offsetEnd.x);
            const midX   = Math.max(leftX, Math.min(rightX, (offsetStart.x + offsetEnd.x) / 2));
            path.push({ x: midX, y: offsetStart.y, isOffset: false });
            path.push({ x: midX, y: offsetEnd.y, isOffset: false });
        } else if (!isStartHorizontal && !isEndHorizontal) {
            // V -> H -> V: need horizontal segment in middle
            const midY = (offsetStart.y + offsetEnd.y) / 2;
            path.push({ x: offsetStart.x, y: midY, isOffset: false });
            path.push({ x: offsetEnd.x, y: midY, isOffset: false });
        } else if (isStartHorizontal && !isEndHorizontal) {
            // H -> V: one turn needed
            path.push({ x: offsetEnd.x, y: offsetStart.y, isOffset: false });
        } else {
            // V -> H: one turn needed
            path.push({ x: offsetStart.x, y: offsetEnd.y, isOffset: false });
        }
        
        // OFFSET SEGMENT 2: Add approach point
        path.push(offsetEnd);
        
        // OFFSET SEGMENT 2: End at connection point
        path.push({ x: end.x, y: end.y, isOffset: true });
        
        return path;
    }

    getElementBounds(el) {
        const padding = 20;
        if (el.type === 'process') {
            return {
                x1: el.x - 90 - padding,
                y1: el.y - 30 - padding,
                x2: el.x + 90 + padding,
                y2: el.y + 30 + padding
            };
        } else if (el.type === 'start' || el.type === 'end') {
            return {
                x1: el.x - 20 - padding,
                y1: el.y - 20 - padding,
                x2: el.x + 20 + padding,
                y2: el.y + 20 + padding
            };
        } else if (el.type === 'decision-x' || el.type === 'decision-plus') {
            return {
                x1: el.x - 50 - padding,
                y1: el.y - 50 - padding,
                x2: el.x + 50 + padding,
                y2: el.y + 50 + padding
            };
        } else if (el.type === 'comment') {
            const size = el.minimized ? 15 : 50;
            return {
                x1: el.x - size - padding,
                y1: el.y - size - padding,
                x2: el.x + size + padding,
                y2: el.y + size + padding
            };
        } else {
            return {
                x1: el.x - 30 - padding,
                y1: el.y - 30 - padding,
                x2: el.x + 30 + padding,
                y2: el.y + 30 + padding
            };
        }
    }

    renderArrow(arrow) {
        const startEl = this.elements.find(el => el.id === arrow.start);
        const endEl = this.elements.find(el => el.id === arrow.end);
        
        if (!startEl || !endEl) return null;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        // Get actual connection points
        const startPoints = this.getConnectionPoints(startEl);
        const endPoints = this.getConnectionPoints(endEl);
        
        let startPoint = { ...( startPoints.find(p => p.direction === arrow.startDir && p.portIndex === (arrow.startPortIndex || 0)) 
            || startPoints.find(p => p.direction === arrow.startDir) 
            || startPoints[0] ) };
        let endPoint   = { ...( endPoints.find(p => p.direction === arrow.endDir && p.portIndex === (arrow.endPortIndex || 0))
            || endPoints.find(p => p.direction === arrow.endDir)
            || endPoints[0]   ) };

        // Use custom waypoints if they exist, otherwise calculate route
        let routedPath;
        if (arrow.waypoints && arrow.waypoints.length > 0) {
            // Adjust first and last waypoints to match spread-offset start/end points
            // so the exit/entry segments stay perfectly horizontal or vertical
            const wps = arrow.waypoints.map(p => ({ ...p }));
            // First waypoint: match the Y of startPoint (for right/left exits)
            // or match the X of startPoint (for top/bottom exits)
            if (arrow.startDir === 'left' || arrow.startDir === 'right') {
                wps[0].y = startPoint.y;
            } else {
                wps[0].x = startPoint.x;
            }
            // Last waypoint: match the Y of endPoint (for right/left entries)
            // or match the X of endPoint (for top/bottom entries)
            if (arrow.endDir === 'left' || arrow.endDir === 'right') {
                wps[wps.length - 1].y = endPoint.y;
            } else {
                wps[wps.length - 1].x = endPoint.x;
            }
            routedPath = [startPoint, ...wps, endPoint];
        } else {
            // Calculate orthogonal route
            routedPath = this.calculateOrthogonalRoute(startPoint, endPoint, arrow.startDir, arrow.endDir, startEl, endEl);
        }
        
        // Build path from routed points - shorten the last segment for arrowhead
        const lastPoint = routedPath[routedPath.length - 1];
        const secondLastPoint = routedPath[routedPath.length - 2];
        
        // Calculate direction and shorten
        const dx = lastPoint.x - secondLastPoint.x;
        const dy = lastPoint.y - secondLastPoint.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const shortenBy = 10;
        
        let shortenedEnd = { ...lastPoint };
        if (length > 0) {
            shortenedEnd.x = lastPoint.x - (dx / length) * shortenBy;
            shortenedEnd.y = lastPoint.y - (dy / length) * shortenBy;
        }
        
        let d = `M ${routedPath[0].x} ${routedPath[0].y}`;
        for (let i = 1; i < routedPath.length - 1; i++) {
            d += ` L ${routedPath[i].x} ${routedPath[i].y}`;
        }
        d += ` L ${shortenedEnd.x} ${shortenedEnd.y}`;
        
        // Create path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', this.selectedArrow === arrow.id ? '#2196F3' : 'var(--arrow-color)');
        path.setAttribute('stroke-width', this.selectedArrow === arrow.id ? '3' : '2');
        path.setAttribute('fill', 'none');
        path.classList.add('arrow-path');
        path.dataset.arrowId = arrow.id;
        
        g.appendChild(path);

        // Draw arrowhead pointing TOWARDS the element based on endDir
        // If endDir is 'left', arrow points right (towards element)
        // If endDir is 'right', arrow points left (towards element)
        // If endDir is 'top', arrow points down (towards element)
        // If endDir is 'bottom', arrow points up (towards element)
        
        let arrowAngle = 0;
        if (arrow.endDir === 'right') arrowAngle = Math.PI; // Point left
        else if (arrow.endDir === 'left') arrowAngle = 0; // Point right
        else if (arrow.endDir === 'bottom') arrowAngle = -Math.PI / 2; // Point up
        else if (arrow.endDir === 'top') arrowAngle = Math.PI / 2; // Point down
        
        const arrowSize = 12;
        const arrowhead = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        
        // Tip of arrow at lastPoint, base points behind it
        const p1x = lastPoint.x;
        const p1y = lastPoint.y;
        const p2x = lastPoint.x - arrowSize * Math.cos(arrowAngle - Math.PI / 7);
        const p2y = lastPoint.y - arrowSize * Math.sin(arrowAngle - Math.PI / 7);
        const p3x = lastPoint.x - arrowSize * Math.cos(arrowAngle + Math.PI / 7);
        const p3y = lastPoint.y - arrowSize * Math.sin(arrowAngle + Math.PI / 7);
        
        const arrowColor = this.selectedArrow === arrow.id ? '#2196F3' : (document.body.dataset.theme === 'dark' ? '#ffffff' : '#000000');
        arrowhead.setAttribute('points', `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`);
        arrowhead.setAttribute('fill', arrowColor);
        arrowhead.setAttribute('stroke', arrowColor);
        arrowhead.setAttribute('stroke-width', '1');
        arrowhead.classList.add('arrow-path');
        arrowhead.classList.add('arrowhead-draggable');
        arrowhead.dataset.arrowId = arrow.id;
        arrowhead.style.cursor = this.selectedArrow === arrow.id ? 'move' : 'pointer';
        
        g.appendChild(arrowhead);

        // Add draggable start point indicator if selected
        if (this.selectedArrow === arrow.id) {
            const startCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            startCircle.setAttribute('cx', routedPath[0].x);
            startCircle.setAttribute('cy', routedPath[0].y);
            startCircle.setAttribute('r', 8);
            startCircle.setAttribute('fill', '#2196F3');
            startCircle.setAttribute('stroke', '#1976D2');
            startCircle.setAttribute('stroke-width', 2);
            startCircle.classList.add('arrowstart-draggable');
            startCircle.dataset.arrowId = arrow.id;
            startCircle.style.cursor = 'move';
            g.appendChild(startCircle);
        }

        // Add segment handles if selected (in middle of each segment)
        // Only show handles for NON-OFFSET segments (routing segments)
        if (this.selectedArrow === arrow.id && routedPath.length > 1) {
            for (let i = 0; i < routedPath.length - 1; i++) {
                const p1 = routedPath[i];
                const p2 = routedPath[i + 1];
                
                // Skip offset segments (first and last two segments)
                if (p1.isOffset || p2.isOffset) continue;
                
                // Calculate midpoint of segment
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                
                // Determine if segment is horizontal or vertical
                const isHorizontal = Math.abs(p2.x - p1.x) > Math.abs(p2.y - p1.y);
                
                const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                handle.setAttribute('x', midX - 6);
                handle.setAttribute('y', midY - 6);
                handle.setAttribute('width', 12);
                handle.setAttribute('height', 12);
                handle.setAttribute('fill', '#FF9800');
                handle.setAttribute('stroke', '#F57C00');
                handle.setAttribute('stroke-width', 2);
                handle.setAttribute('rx', 2);
                handle.classList.add('segment-handle');
                handle.dataset.arrowId = arrow.id;
                handle.dataset.segmentIndex = i;
                handle.dataset.isHorizontal = isHorizontal;
                handle.style.cursor = isHorizontal ? 'ns-resize' : 'ew-resize';
                g.appendChild(handle);
            }
        }

        // Remove old corner control points code
        // if (this.selectedArrow === arrow.id && routedPath.length > 2) { ... }

        // Label at midpoint
        const midIndex = Math.floor(routedPath.length / 2);
        const labelPoint = routedPath[midIndex];
            
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', labelPoint.x);
        text.setAttribute('y', labelPoint.y - 10);
        text.classList.add('arrow-label');
        text.textContent = arrow.label;
        g.appendChild(text);

        return g;
    }

    expandAll() {
        this.elements.forEach(el => {
            if (el.type === 'process') {
                this.expandedProcesses.add(el.id);
            }
        });
        this.render();
    }

    collapseAll() {
        this.expandedProcesses.clear();
        this.render();
    }

    render() {
        while (this.canvas.firstChild && this.canvas.firstChild.tagName !== 'defs') {
            this.canvas.removeChild(this.canvas.lastChild);
        }

        // Render elements first
        this.elements.forEach(element => {
            const el = this.renderElement(element);
            this.canvas.appendChild(el);
        });

        // Assign portIndex to arrows that don't have one yet
        const portCounter = {};
        this.arrows.forEach(arrow => {
            const sk = `${arrow.start}:${arrow.startDir}`;
            const ek = `${arrow.end}:${arrow.endDir}`;
            if (arrow.startPortIndex === undefined) {
                arrow.startPortIndex = portCounter[sk] || 0;
                portCounter[sk] = (portCounter[sk] || 0) + 1;
            }
            if (arrow.endPortIndex === undefined) {
                arrow.endPortIndex = portCounter[ek] || 0;
                portCounter[ek] = (portCounter[ek] || 0) + 1;
            }
        });

        // Render arrows — portIndex on each arrow maps to the physical connection point
        this.arrows.forEach(arrow => {
            const arrowEl = this.renderArrow(arrow);
            if (arrowEl) this.canvas.appendChild(arrowEl);
        });

        // Post-render hook — allows external code (e.g. generator.js) to apply
        // visual overrides after every render without patching app.js further
        if (typeof this.onAfterRender === 'function') this.onAfterRender();
    }
}

// Initialize
const editor = new BPMNEditor();
