declare module 'virtual:astro-creatures-museum/config' {
  const config: import('./types').Config;
  export default config;
}

declare module 'virtual:astro-creatures-museum/templates' {
  const templates: import('./exhibits/types').ExhibitTemplate[];
  export default templates;
}
