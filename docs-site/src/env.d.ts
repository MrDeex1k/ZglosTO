/// <reference types="astro/client" />

declare module '@fontsource-variable/inter';
declare module '@fontsource-variable/jetbrains-mono';

// The native TS compiler cannot read Astro templates. Their implementations and
// props are checked separately by scripts/check-astro.mjs with the Astro plugin.
declare module '*.astro' {
  const component: import('astro/runtime/server/index.js').AstroComponentFactory;
  export default component;
}
