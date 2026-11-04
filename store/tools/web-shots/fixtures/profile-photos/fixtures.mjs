import * as base from '../ride-mode-overlap/fixtures.mjs';
// Profile pictures for most riders (Marcus, …003, has none and keeps his initial).
const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const pics = { [base.ME]: 'me', [U(1)]: 'u1', [U(2)]: 'u2', [U(4)]: 'u4', [U(5)]: 'u5', [U(6)]: 'u6' };
const noMe = process.env.NOME === '1';
export const avatarFile = (path) => {
  const id = path.split('/')[0];
  return pics[id];
};
export const tables = {
  ...base.tables,
  profiles: base.tables.profiles.map((p) => ({
    ...p,
    avatar_path: pics[p.id] && !(noMe && p.id === base.ME) ? `${p.id}/avatar-1730505600000.jpg` : null,
  })),
};
export const rpcs = base.rpcs;
export const session = base.session;
export const localTrails = [];
