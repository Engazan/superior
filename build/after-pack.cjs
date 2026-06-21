// Restores exec permissions on bundled native helpers, then ad-hoc code-signs
// the packaged macOS app.
//
// node-pty (1.1.0) ships its prebuilt `spawn-helper` binaries as mode 0644 —
// the executable bit is missing from the npm tarball. node-pty execs that
// helper for every pty it forks; without +x the kernel refuses it and the
// spawn fails with "posix_spawnp failed", which the app surfaces as
// "Timed out waiting for the terminal daemon." electron-builder copies the
// files verbatim (preserving 0644), so we re-add +x here on every platform.
//
// Ad-hoc signing (macOS): electron-builder skips code signing entirely when no
// Apple Developer ID is available (e.g. on the GitHub Actions runner). That
// leaves Electron's stale default signature whose sealed resources no longer
// match the renamed bundle, so macOS reports the download as "damaged and
// can't be opened" (a hard block — even right-click → Open won't bypass it).
// Re-sealing with an ad-hoc signature ("-") makes the signature valid again.
// Gatekeeper then treats it as a normal unsigned app from an "unidentified
// developer", which the user can open via right-click → Open / "Open Anyway".
//
// Ordering: chmod runs BEFORE signing so the new mode is in place when the
// signature is sealed (POSIX perms aren't covered by the signature, but doing
// it first keeps the on-disk state consistent). This hook runs BEFORE
// electron-builder's own sign step and before any electronFuses flip (none are
// configured here, so nothing mutates the binary after this point and
// invalidates the signature). On a machine that has a real Developer ID in the
// keychain, electron-builder's later sign step re-signs over this ad-hoc
// signature — which is exactly what we want.
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

/** Recursively chmod +x every node-pty `spawn-helper` under a directory. */
function fixSpawnHelperPerms(root) {
  if (!fs.existsSync(root)) return
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      fixSpawnHelperPerms(full)
    } else if (entry.name === 'spawn-helper') {
      fs.chmodSync(full, 0o755)
      console.log(`after-pack: chmod +x ${full}`)
    }
  }
}

exports.default = async function afterPack(context) {
  // node-pty lives in the unpacked asar dir (asarUnpack), present on every OS.
  const resourcesDir =
    context.electronPlatformName === 'darwin'
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources'
        )
      : path.join(context.appOutDir, 'resources')
  fixSpawnHelperPerms(path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', 'node-pty'))

  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  })
}
