declare const __DEV_LAN_IP__: string;

interface ImportMetaEnv {
  readonly VITE_PARTY_HOST: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
