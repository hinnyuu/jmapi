import fs from 'node:fs';

export function parseIdMap(text) {
  return text.trim().split('\n').filter(Boolean).map((line) => {
    const [inside, outside, count] = line.trim().split(/\s+/).map(Number);
    return { inside, outside, count };
  });
}

function isIdentity(map) {
  return map.length === 1 && map[0].inside === 0 && map[0].outside === 0;
}

// stat 拿到的是**容器侧** uid：rootless 下它已是映射结果，直接以其为目标降权，
// 容器产出文件在宿主上即归 bind 属主；uid_map 只用于区分 rootful 与识别溢出属主。
export function computeDemotion({ stateDir, euid, uidMap, puid = null, pgid = null }) {
  if (euid !== 0) return null;
  const st = fs.statSync(stateDir);
  if (puid !== null) return { uid: puid, gid: pgid ?? st.gid, chown: false };
  if (isIdentity(uidMap)) {
    if (st.uid === 0) return { uid: 1000, gid: 1000, chown: true };
    return { uid: st.uid, gid: st.gid, chown: false };
  }
  if (st.uid === 65534 || st.gid === 65534) {
    const err = new Error('state 目录属主为溢出 uid/gid 65534（宿主 root 属主 bind 在 rootless 下无映射）；改 bind 属主为运行用户或检查 SELinux 标签（:Z）');
    err.code = 'EACCES';
    throw err;
  }
  return { uid: st.uid, gid: st.gid, chown: false };
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