// Memuat office.config.json dan melengkapi nilai bawaan, supaya bagian lain
// tidak perlu memeriksa field yang kosong.

const ROLE_DEFAULTS = { pants: '#2b2b2b', hair: '#161616', face: 'smile', print: 'letter' };

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function normalizeConfig(raw) {
  const roles = new Map(); // agent_type → { division, style }

  const divisions = (raw.divisions ?? []).map((d) => {
    const division = {
      id: d.id,
      name: d.name ?? capitalize(d.id),
      color: d.color ?? '#7a7f87',
      desks: Math.max(1, d.desks ?? 4),
      roleKeys: Object.keys(d.roles ?? {}),
    };
    for (const [key, role] of Object.entries(d.roles ?? {})) {
      if (roles.has(key)) console.warn(`[config] peran "${key}" terdaftar di lebih dari satu divisi`);
      roles.set(key, {
        division: division.id,
        style: { ...ROLE_DEFAULTS, label: capitalize(key), shirt: division.color, accent: division.color, ...role },
      });
    }
    if (division.roleKeys.length > division.desks) {
      console.warn(`[config] divisi "${division.id}" punya ${division.roleKeys.length} peran tetapi hanya ${division.desks} meja`);
      division.desks = division.roleKeys.length;
    }
    return division;
  });

  const fallback = {
    id: 'fallback',
    name: raw.fallback?.name ?? 'Umum',
    color: raw.fallback?.color ?? '#7a7f87',
    desks: Math.max(1, raw.fallback?.desks ?? 4),
    roleKeys: [],
  };

  return {
    name: raw.name ?? 'MY Office',
    workspace: raw.workspace ?? null,
    studio: raw.studio ?? null,
    officeFolder: raw.officeFolder ?? 'my-office',
    lead: { ...ROLE_DEFAULTS, label: 'CEO', shirt: '#f4f2ec', print: 'tie', accent: '#141414', ...raw.lead },
    divisions,
    fallback,
    roles,
  };
}

export async function loadConfig() {
  const res = await fetch('/office.config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`office.config.json tidak bisa dimuat (${res.status})`);
  return normalizeConfig(await res.json());
}
