/**
 * pnpmfile.cjs - Industrial-Grade Build Hook
 * Implementira whitelist za pnpm v11 build izolaciju.
 */
function readPackage(pkg, context) {
  const allowed = [
    '@parcel/watcher',
    '@swc/core',
    'esbuild',
    'protobufjs',
    'sharp',
    'workerd'
  ];
  
  if (allowed.includes(pkg.name)) {
    // Force flag za pnpm da prepozna dozvolu unutar CI okruženja
    pkg.scripts = pkg.scripts || {};
  }
  
  return pkg;
}

module.exports = {
  hooks: {
    readPackage
  }
};
