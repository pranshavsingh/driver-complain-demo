const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro config for a pnpm workspace.
 *
 * pnpm installs dependencies isolated (a symlink farm under the repo-root node_modules/.pnpm)
 * instead of hoisting them into apps/mobile/node_modules. Metro's default resolver looks in the
 * project's own node_modules and does not watch anything outside the project, so a bundle would
 * fail on @driver-complaint/shared-types.
 *
 * Two settings fix it, and this is the supported way — switching the repo to
 * node-linker=hoisted would also work but would relayout the API's Prisma install, which is
 * currently working.
 *
 * `resolver.disableHierarchicalLookup` is deliberately left at its default (false). Expo's
 * monorepo guide used to recommend turning it on, but under pnpm the parent-directory walk is
 * exactly how a package inside node_modules/.pnpm/<pkg>/node_modules/<pkg> finds its own
 * dependencies — disabling it breaks transitive resolution. expo-doctor flags any override here.
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole workspace so an edit in packages/shared-types triggers a rebundle.
config.watchFolders = [workspaceRoot];

// 2. Look for modules in the app first, then at the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Stub out expo-audio and expo-video for Expo Go.
//    These packages require custom native builds and have no SDK 52/54 release.
//    resolveRequest intercepts Metro's module resolution and points these imports
//    at local no-op stubs so the app can load without the native modules.
const STUBS = {
  'expo-audio': path.resolve(projectRoot, 'src/stubs/expo-audio.js'),
  'expo-video': path.resolve(projectRoot, 'src/stubs/expo-video.js'),
  '@react-native-firebase/app': path.resolve(projectRoot, 'src/stubs/firebase.js'),
  '@react-native-firebase/messaging': path.resolve(projectRoot, 'src/stubs/firebase.js'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (STUBS[moduleName]) {
    return { filePath: STUBS[moduleName], type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
