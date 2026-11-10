const fs = require('fs');
const path = require('path');

function formatName(folder) {
  return folder
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const toolsDir = path.join(process.cwd(), 'tools');

  try {
    const entries = fs.readdirSync(toolsDir, { withFileTypes: true });
    const tools = entries
      .filter(e => {
        if (!e.isDirectory()) return false;
        return fs.existsSync(path.join(toolsDir, e.name, 'index.html'));
      })
      .map(e => {
        let name = formatName(e.name);
        let desc = '';
        try {
          const meta = JSON.parse(
            fs.readFileSync(path.join(toolsDir, e.name, 'meta.json'), 'utf-8')
          );
          if (meta.name) name = meta.name;
          if (meta.desc) desc = meta.desc;
        } catch {}
        return { folder: e.name, name, desc };
      });

    res.json(tools);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
