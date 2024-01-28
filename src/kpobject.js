export default function kpobject(...entries) {
  return new Map(entries);
}

export function toKpobject(object) {
  return kpobject(...Object.entries(object));
}

export function toJsObject(kpo) {
  return Object.fromEntries([...kpo]);
}

export function kpoEntries(kpo) {
  return [...kpo];
}

export function kpoKeys(kpo) {
  return [...kpo.keys()];
}

export function kpoValues(kpo) {
  return [...kpo.values()];
}

export function kpoSet(kpo, key, newValue) {
  return new Map([...kpo, [key, newValue]]);
}

export function kpoUpdate(kpo, key, f) {
  return kpoSet(kpo, key, f(kpo.get(key)));
}

export function kpoMap(kpo, f) {
  return new Map([...kpo].map(f));
}

export function kpoFilter(kpo, f) {
  return new Map([...kpo].filter(f));
}

export function kpoMerge(...kpos) {
  return new Map(
    [].concat.apply(
      [],
      kpos.map((kpo) => [...kpo])
    )
  );
}
