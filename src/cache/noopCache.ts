import type { Cache } from "./cache";

export function createNoopCache(): Cache {
  return {
    async get() {
      return null;
    },
    async set() {},
    async delete() {},
  };
}
