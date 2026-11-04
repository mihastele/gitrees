const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const gitExec = promisify(execFile);
const publicDir = path.join(__dirname, 'public');
async function git(dir, args) {
  const { stdout } = await gitExec('git', ['-C', dir, ...args], { maxBuffer: 20 * 1024 * 1024, windowsHide: true, encoding: 'utf8' });
  return stdout;
}
async function discover(root) {
  const top = (await git(root, ['rev-parse', '--show-toplevel'])).trim();
  const repos = []; const seen = new Set();
  async function visit(dir, relative) {
    const real = await fs.promises.realpath(dir);
    if (seen.has(real)) return; seen.add(real);
    repos.push({ path: real, name: relative || path.basename(real), relative: relative || '.', root: !relative });
    let config;
    try { config = await git(real, ['config', '--file', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$']); } catch { return; }
    for (const line of config.trim().split(/\r?\n/)) {
      const match = line.match(/^\S+\s+(.+)$/); if (!match) continue;
      const child = path.resolve(real, match[1]);
      try { await git(child, ['rev-parse', '--git-dir']); await visit(child, relative ? `${relative}/${match[1]}` : match[1]); } catch { repos.push({ path: child, name: match[1], relative: relative ? `${relative}/${match[1]}` : match[1], unavailable: true }); }
    }
  }
  await visit(top, ''); return repos;
}
function parseLog(raw, repo) {
  return raw.split('\x1e').filter(x => x.trim()).map(record => {
    const [hash, parents, author, email, date, refs, subject] = record.trim().split('\x1f');
    return { hash, parents: parents ? parents.split(' ') : [], author, email, date, refs, subject, repo: repo.path, repoName: repo.name, relative: repo.relative };
  });
}
async function history(repo, limit = 200) {
  try { return parseLog(await git(repo.path, ['log', '--all', `--max-count=${limit}`, '--date-order', '--format=%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%D%x1f%s']), repo); }
  catch (e) { if (/does not have any commits|unknown revision|bad revision/i.test(e.stderr || '')) return []; throw e; }
}
async function api(req, res, url) {
  const root = url.searchParams.get('root'); if (!root) throw new Error('Choose a repository folder first.');
  const repos = await discover(root);
  if (url.pathname === '/api/repos') return { root: repos[0].path, repos };
  const selected = url.searchParams.getAll('repo');
  const allowed = repos.filter(r => !r.unavailable && selected.includes(r.path));
  if (url.pathname === '/api/history') {
    const logs = await Promise.all(allowed.map(r => history(r)));
    const commits = []; while (logs.some(log => log.length)) { let best = -1; for (let i = 0; i < logs.length; i++) if (logs[i].length && (best < 0 || Date.parse(logs[i][0].date) > Date.parse(logs[best][0].date))) best = i; commits.push(logs[best].shift()); } return { commits };
  }
  if (url.pathname === '/api/commit') {
    const repo = allowed[0]; const hash = url.searchParams.get('hash');
    if (!repo || !/^[a-f0-9]{40,64}$/i.test(hash || '')) throw new Error('Invalid repository or commit.');
    const [details, stat, diff] = await Promise.all([
      git(repo.path, ['show', '-s', '--format=%B', hash]),
      git(repo.path, ['show', '--format=', '--stat', '--no-renames', hash]),
      git(repo.path, ['show', '--format=', '--no-ext-diff', '--no-color', '--no-renames', '--find-copies=0', hash, '--'])
    ]);
    return { details, stat, diff };
  }
  throw new Error('Unknown endpoint.');
}
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) { const data = await api(req,res,url); res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); return res.end(JSON.stringify(data)); }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!['index.html','app.js','style.css'].includes(file)) { res.writeHead(404); return res.end('Not found'); }
    const content = await fs.promises.readFile(path.join(publicDir,file));
    res.writeHead(200, {'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8'}); res.end(content);
  } catch (err) { res.writeHead(400, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({error: (err.stderr || err.message || 'Git command failed').trim()})); }
});
if (require.main === module) server.listen(process.env.PORT || 4173, '127.0.0.1', () => console.log(`Gitrees running at http://127.0.0.1:${process.env.PORT || 4173}`));
module.exports = { discover, history, parseLog, server };

