#!/usr/bin/env node
// Builds the dashboard for GitHub Pages and, only when asked, publishes it.
//
//   npm run deploy:pages              build and check; pushes nothing (a dry run)
//   npm run deploy:pages -- --push    ...and publish to the gh-pages branch
//
// Options: --remote origin   --branch gh-pages
//
// Why not a GitHub Actions workflow: the run data the dashboard shows (public/data, tens of
// megabytes) is not in git, so a build made from git has no data. This builds here, where the
// data is, and publishes the finished folder as a single commit on gh-pages, force-pushed each
// time. That keeps the data out of main's history and out of the history of gh-pages too.
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRuns, folderSize, megabytes, pagesTarget, parseRemote, SIZE_WARNING_MB } from './pages.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback
}
const push = args.includes('--push')
const remote = option('remote', 'origin')
const branch = option('branch', 'gh-pages')

const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8' }).trim()
function stop(message) {
  console.error(`\nStopped: ${message}`)
  process.exit(1)
}

// Never publish over the branch the code lives on.
if (['main', 'master'].includes(branch)) stop(`--branch ${branch} would overwrite the source. Use gh-pages.`)

let target
let remoteUrl
try {
  remoteUrl = git('remote', 'get-url', remote)
  target = pagesTarget(parseRemote(remoteUrl))
} catch (error) {
  stop(error.message)
}

const { runs, problems } = checkRuns(join(root, 'public', 'data'))
if (problems.length) stop(`the run data is not ready:\n  - ${problems.join('\n  - ')}`)

if (git('status', '--porcelain', '--untracked-files=no')) {
  console.warn('Note: there are uncommitted changes. The build stamp in the footer names the last commit, not these.')
}

console.log(`Building for ${target.url} (base ${target.base}, data at ${target.dataUrl}) ...\n`)
const build = spawnSync('npm', ['run', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  // Set here so they win over any .env.local on this machine
  env: { ...process.env, VITE_BASE: target.base, VITE_DATA_URL: target.dataUrl },
})
if (build.status !== 0) stop('the build failed (see above).')

const dist = join(root, 'dist')
if (!existsSync(join(dist, 'index.html'))) stop('the build produced no dist/index.html.')
// Pages answers an address it does not know with 404.html. Serving the app there lets a
// refresh on /Tango/copilot, or a pasted deep link, load the app and show that page.
copyFileSync(join(dist, 'index.html'), join(dist, '404.html'))
// Without this, Pages would run the folder through Jekyll, which skips files starting with an underscore.
writeFileSync(join(dist, '.nojekyll'), '')

const size = folderSize(dist) / 1048576
console.log(`\nBuilt: ${size.toFixed(1)} MB, ${runs.length} run(s): ${runs.map((run) => run.name ?? run.id).join('; ')}`)
if (size > SIZE_WARNING_MB) console.warn(`Warning: GitHub Pages sites are limited to 1 GB; this is ${megabytes(size * 1048576)} MB.`)

if (!push) {
  console.log(`\nDry run: nothing was pushed. To publish to ${remote}/${branch}:\n  npm run deploy:pages -- --push`)
  console.log(`Then, once, in the repository's Settings > Pages, set the source to the ${branch} branch.`)
  process.exit(0)
}

const commit = git('rev-parse', '--short', 'HEAD')
const tmp = mkdtempSync(join(tmpdir(), 'tango-pages-'))
try {
  cpSync(dist, tmp, { recursive: true })
  const inTmp = (...gitArgs) => execFileSync('git', gitArgs, { cwd: tmp, stdio: 'inherit' })
  inTmp('init', '-q', '-b', branch)
  // Leave line endings alone: the folder is a build, not source.
  inTmp('config', 'core.autocrlf', 'false')
  inTmp('add', '-A')
  inTmp(
    '-c', `user.name=${git('config', 'user.name')}`,
    '-c', `user.email=${git('config', 'user.email')}`,
    'commit', '-q', '-m', `Deploy ${commit}, ${new Date().toISOString().slice(0, 10)}`,
  )
  console.log(`\nPushing to ${remote}/${branch} (replacing what was there) ...`)
  inTmp('push', '--force', remoteUrl, `${branch}:${branch}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(`\nPublished. In Settings > Pages the source must be the ${branch} branch; the site is then at\n  ${target.url}`)
