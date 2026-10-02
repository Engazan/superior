// Keep CSS imports typed before Expo generates local development types.
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.css';
