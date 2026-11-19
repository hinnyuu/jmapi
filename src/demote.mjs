import fs from 'node:fs';

export function parseIdMap(text) {
  return text.trim().split('\n').filter(Boolean).map((line) => {
    const [inside, outside, count] = line.trim().split(/\s+/).map(Number);
    return { inside, outside, count };
  });
}

export function mapHostToContainer(map, hostId) {
  for (const r of map) {
    if (hostId >= r.outside && hostId < r.outside + r.count) return r.inside + (hostId - r.outside);
  }
  return null;
}

function isIdentity(map) {
  return map.length === 1 && map[0].inside === 0 && map[0].outside === 0;
}

// 目标 uid/gid：bind 属主映射回容器内身份，使容器产出文件在宿主上仍归 bind 属主。
export function computeDemotion({ stateDir, euid, uidMap, gidMap, puid = null, pgid = null }) {
  if (euid !== 0) return null;
  const st = fs.statSync(stateDir);
  if (puid !== null) return { uid: puid, gid: pgid ?? st.gid, chown: false };
  if (isIdentity(uidMap)) {
    if (st.uid === 0) return { uid: 1000, gid: 1000, chown: true };
    return { uid: st.uid, gid: st.gid, chown: false };
  }
  const uid = mapHostToContainer(uidMap, st.uid);
  const gid = mapHostToContainer(gidMap, st.gid);
  if (uid === null || gid === null) {
    const err = new Error(`state 目录属主 uid=${st.uid} gid=${st.gid} 不在 userns 映射内；检查 bind 属主或 SELinux 标签（:Z）`);
    err.code = 'EACCES';
    throw err;
  }
  return { uid, gid, chown: false };
}

export function chownRecursive(dir, uid, gid) {
  fs.chownSync(dir, uid, gid);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) chownRecursive(p, uid, gid);
    else fs.chownSync(p, uid, gid);
  }
}

export function applyDemotion(target, dirs) {
  if (!target) return;
  if (target.chown) for (const d of dirs) chownRecursive(d, target.uid, target.gid);
  if (target.uid === 0 && target.gid === 0) return;
  process.setgroups([]);
  process.setgid(target.gid);
  process.setuid(target.uid);
}