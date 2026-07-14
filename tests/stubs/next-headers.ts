// Framework-boundary stub: the request cookie store only exists inside the
// Next.js runtime. Tests run as the signed-in demo user u1.
const jar = new Map([["session-user", { name: "session-user", value: "u1" }]]);

export async function cookies() {
  return {
    get: (name: string) => jar.get(name),
    set: (name: string, value: string) => jar.set(name, { name, value }),
    delete: (name: string) => jar.delete(name),
  };
}
