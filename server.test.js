const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { discover, history, server } = require('./server');
function git(dir, ...args) { return execFileSync('git', ['-C', dir, ...args], { encoding:'utf8', stdio:['ignore','pipe','pipe'] }); }
function init(dir) { fs.mkdirSync(dir); git(dir,'init'); git(dir,'config','user.email','test@example.com'); git(dir,'config','user.name','Test User'); fs.writeFileSync(path.join(dir,'file.txt'),'hello\n'); git(dir,'add','.'); git(dir,'commit','-m','Initial commit'); }
test('discovers submodules, loads history, and serves commit diff', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'gitrees-')); t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const child=path.join(temp,'child'), root=path.join(temp,'root'); init(child); init(root);
  git(root,'-c','protocol.file.allow=always','submodule','add',child,'modules/child'); git(root,'commit','-am','Add submodule');
  const repos=await discover(root); assert.equal(repos.length,2); assert.equal(repos[1].relative,'modules/child');
  const commits=await history(repos[0]); assert.equal(commits.length,2); assert.equal(commits[0].subject,'Add submodule');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`;
  const params=new URLSearchParams({root,repo:repos[0].path,hash:commits[0].hash});
  const response=await fetch(`${base}/api/commit?${params}`); const data=await response.json(); assert.equal(response.status,200,JSON.stringify(data)); assert.match(data.diff,/modules\/child/);
});
