import Storage from 'expo-sqlite/kv-store';

export const kv = {
  get: (key: string): string | null => Storage.getItemSync(key),
  set: (key: string, value: string): void => {
    Storage.setItemSync(key, value);
  },
  remove: (key: string): void => {
    Storage.removeItemSync(key);
  },
};
