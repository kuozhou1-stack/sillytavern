/** Host modules stay in the parent realm so importing them does not start another Tavern inside the card iframe. */
export type NativeModules = Record<string, any>;

let loading: Promise<NativeModules> | undefined;

export function loadNativeModules(): Promise<NativeModules> {
  if (loading) return loading;
  const host = window.parent as Window & typeof globalThis;
  const importFromHost = new host.Function('url', 'return import(url)') as (url: string) => Promise<any>;
  const paths = {
    script: '/script.js',
    openai: '/scripts/openai.js',
    worldInfo: '/scripts/world-info.js',
    promptManager: '/scripts/PromptManager.js',
    regex: '/scripts/extensions/regex/engine.js',
    extensions: '/scripts/extensions.js',
    powerUser: '/scripts/power-user.js',
    authorsNote: '/scripts/authors-note.js',
    utils: '/scripts/utils.js',
    tokenizers: '/scripts/tokenizers.js',
    groupChats: '/scripts/group-chats.js',
    customRequest: '/scripts/custom-request.js',
    i18n: '/scripts/i18n.js',
  };
  loading = Promise.all(Object.entries(paths).map(async ([key, path]) =>
    [key, await importFromHost(new URL(path, host.location.href).href)]))
    .then(entries => ({ ...Object.fromEntries(entries), host }))
    .catch(error => { loading = undefined; throw error; });
  return loading;
}
