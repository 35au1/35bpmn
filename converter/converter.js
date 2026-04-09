function parseMarkdownTable(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
  if (lines.length < 2) return null;

  const parseRow = line => line.split('|').slice(1, -1).map(c => c.trim());

  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow); // skip separator line

  return { headers, rows };
}

function toCSV(table) {
  const escape = val => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  };
  const lines = [table.headers, ...table.rows].map(row => row.map(escape).join(','));
  return lines.join('\n');
}

function downloadCSV(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function convert() {
  const status = document.getElementById('status');
  const error = document.getElementById('error');
  status.textContent = '';
  error.textContent = '';

  const raw = document.getElementById('input').value.trim();
  if (!raw) { error.textContent = 'No input provided.'; return; }

  // Split into two tables by blank line between them
  const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(b => b.length > 0);

  if (blocks.length < 2) {
    error.textContent = 'Could not find two tables. Make sure they are separated by a blank line.';
    return;
  }

  const table1 = parseMarkdownTable(blocks[0]);
  const table2 = parseMarkdownTable(blocks[1]);

  if (!table1 || !table2) {
    error.textContent = 'Failed to parse one or both tables. Check the format.';
    return;
  }

  downloadCSV('elements.csv', toCSV(table1));
  setTimeout(() => downloadCSV('connections.csv', toCSV(table2)), 300);

  status.textContent = 'Downloaded: elements.csv and connections.csv';
}
