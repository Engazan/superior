// Ad-hoc code-signs the packaged macOS app.
//
// Why: electron-builder skips code signing entirely when no Apple Developer
// ID is available (e.g. on the GitHub Actions runner). That leaves Electron's
// stale default signature whose sealed resources no longer match the renamed
// bundle, so macOS reports the download as "damaged and can't be opened"
// (a hard block — even right-click → Open won't bypass it).
//
// Re-sealing with an ad-hoc signature ("-") makes the signature valid again.
// Gatekeeper then treats it as a normal unsigned app from an "unidentified
// developer", which the user can open via right-click → Open / "Open Anyway".
//
// Ordering: this hook runs BEFORE electron-builder's own sign step and before
// any electronFuses flip (none are configured here, so nothing mutates the
// binary after this point and invalidates the signature). On a machine that
// has a real Developer ID in the keychain, electron-builder's later sign step
// re-signs over this ad-hoc signature — which is exactly what we want.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  })
}
