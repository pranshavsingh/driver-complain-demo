/**
 * babel-preset-expo covers React Native, JSX, TypeScript stripping and expo-router's
 * route registration. Nothing else belongs here — Metro caches aggressively and a custom
 * plugin is the usual cause of "my change is not showing up on the device".
 */
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
