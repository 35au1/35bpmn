// overlap-fixer.js
// Detects overlapping vertical arrow segments and resolves them by
// assigning each overlapping arrow a unique X rail based on the
// horizontal distance from its source to the target.
// Rule: further source = more outer (rightward) rail.

function fixOverlaps(editor) {
  const SEP = 28;
  const OFF = 30;

  // Get edge connection point
  const edgePt = (el, dir) => {
    const hw = el.type==='process'?60:el.type==='decision-x'?50:el.type==='system_action'?65:20;
    const hh = el.type==='process'?30:el.type==='decision-x'?50:el.type==='system_action'?25:20;
    return dir==='right'?{x:el.x+hw,y:el.y}:dir==='left'?{x:el.x-hw,y:el.y}
          :dir==='top'  ?{x:el.x,y:el.y-hh}:{x:el.x,y:el.y+hh};
  };

  // Compute full path for an arrow
  const fullPath = (arrow) => {
    const se = editor.elements.find(e => e.id === arrow.start);
    const ee = editor.elements.find(e => e.id === arrow.end);
    if (!se || !ee) return [];
    const sp = edgePt(se, arrow.startDir);
    const ep = edgePt(ee, arrow.endDir);
    if (arrow.waypoints && arrow.waypoints.length > 0)
      return [sp, ...arrow.waypoints, ep];
    const o1 = arrow.startDir==='right'?{x:sp.x+OFF,y:sp.y}:arrow.startDir==='left'?{x:sp.x-OFF,y:sp.y}:arrow.startDir==='top'?{x:sp.x,y:sp.y-OFF}:{x:sp.x,y:sp.y+OFF};
    const o2 = arrow.endDir==='right'?{x:ep.x+OFF,y:ep.y}:arrow.endDir==='left'?{x:ep.x-OFF,y:ep.y}:arrow.endDir==='top'?{x:ep.x,y:ep.y-OFF}:{x:ep.x,y:ep.y+OFF};
    const h1=arrow.startDir==='left'||arrow.startDir==='right';
    const h2=arrow.endDir==='left'||arrow.endDir==='right';
    const mid=h1&&h2?[{x:(o1.x+o2.x)/2,y:o1.y},{x:(o1.x+o2.x)/2,y:o2.y}]
             :!h1&&!h2?[{x:o1.x,y:(o1.y+o2.y)/2},{x:o2.x,y:(o1.y+o2.y)/2}]
             :h1?[{x:o2.x,y:o1.y}]:[{x:o1.x,y:o2.y}];
    return [sp,o1,...mid,o2,ep];
  };

  // Extract all vertical segments from all arrows
  const allSegs = [];
  editor.arrows.forEach(arrow => {
    const path = fullPath(arrow);
    for (let i = 0; i < path.length-1; i++) {
      const a = path[i], b = path[i+1];
      if (Math.abs(a.x - b.x) < 2) {
        allSegs.push({
          arrow,
          path,
          segIdx: i,
          x: (a.x+b.x)/2,
          yMin: Math.min(a.y,b.y),
          yMax: Math.max(a.y,b.y)
        });
      }
    }
  });

  // Find all overlapping pairs
  const overlappingGroups = []; // each group = set of segments that mutually overlap
  const processed = new Set();

  for (let i = 0; i < allSegs.length; i++) {
    if (processed.has(i)) continue;
    const group = [allSegs[i]];
    for (let j = i+1; j < allSegs.length; j++) {
      if (processed.has(j)) continue;
      const a = allSegs[i], b = allSegs[j];
      if (a.arrow.id === b.arrow.id) continue;
      if (Math.abs(a.x - b.x) < 5 && a.yMax > b.yMin+2 && b.yMax > a.yMin+2) {
        group.push(allSegs[j]);
        processed.add(j);
      }
    }
    if (group.length > 1) {
      processed.add(i);
      overlappingGroups.push(group);
    }
  }

  if (overlappingGroups.length === 0) return false;

  overlappingGroups.forEach(group => {
    // Sort by horizontal distance from source to target: LARGER distance = MORE RIGHT rail
    // This ensures the arrow that travels further horizontally gets the outer rail
    group.sort((a, b) => {
      const seA = editor.elements.find(e => e.id === a.arrow.start);
      const eeA = editor.elements.find(e => e.id === a.arrow.end);
      const seB = editor.elements.find(e => e.id === b.arrow.start);
      const eeB = editor.elements.find(e => e.id === b.arrow.end);
      const distA = seA && eeA ? Math.abs(seA.x - eeA.x) : 0;
      const distB = seB && eeB ? Math.abs(seB.x - eeB.x) : 0;
      return distA - distB; // smaller distance = leftmost (index 0), larger = rightmost
    });

    // Base X = leftmost current X in the group
    const baseX = Math.min(...group.map(s => s.x));

    group.forEach((seg, i) => {
      const newX = baseX + i * SEP;
      if (Math.abs(newX - seg.x) < 2) return; // already correct

      const arrow = seg.arrow;

      // Materialise waypoints if arrow has none
      if (!arrow.waypoints || arrow.waypoints.length === 0) {
        arrow.waypoints = seg.path.slice(1, -1).map(p => ({ x: p.x, y: p.y }));
      }

      // Shift only the waypoints that are part of this vertical segment
      // Match by X proximity to the segment's current X
      arrow.waypoints.forEach(wp => {
        if (Math.abs(wp.x - seg.x) < 5) wp.x = newX;
      });
    });
  });

  return true;
}
