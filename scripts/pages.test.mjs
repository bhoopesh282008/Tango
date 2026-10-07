import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { checkRuns, folderSize, megabytes, pagesTarget, parseRemote, RUN_FILES } from './pages.mjs'

describe('the repository address', () => {
  test.each([
    'https://github.com/bhoopesh282008/Tango.git',
    'https://github.com/bhoopesh282008/Tango',
    'git@github.com:bhoopesh282008/Tango.git',
    'https://github.com/bhoopesh282008/Tango.git\n',
  ])('%j names the owner and the repository', (url) => {
    expect(parseRemote(url)).toEqual({ owner: 'bhoopesh282008', repo: 'Tango' })
  })

  test('something that is not on GitHub is refused, not guessed at', () => {
    expect(() => parseRemote('https://gitlab.com/a/b.git')).toThrow(/not a GitHub remote/)
  })

  test('a project is served under its name, so the app is built for that path', () => {
    expect(pagesTarget({ owner: 'Bhoopesh282008', repo: 'Tango' })).toEqual({
      base: '/Tango/',
      dataUrl: '/Tango/data',
      url: 'https://bhoopesh282008.github.io/Tango/',
    })
  })

  test('a repository named <owner>.github.io is the owner\'s own site, served from the root', () => {
    expect(pagesTarget({ owner: 'ada', repo: 'ada.github.io' })).toEqual({
      base: '/',
      dataUrl: '/data',
      url: 'https://ada.github.io/',
    })
  })

  test('a renamed repository changes the path with it', () => {
    expect(pagesTarget({ owner: 'ada', repo: 'flood-tango' }).base).toBe('/flood-tango/')
  })
})

describe('the run data', () => {
  let dir
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tango-data-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const publish = (id, files = RUN_FILES) => {
    mkdirSync(join(dir, id), { recursive: true })
    for (const file of files) writeFileSync(join(dir, id, file), '{}')
  }

  test('with no runs.json there is nothing to deploy, and it says how to make something', () => {
    const { runs, problems } = checkRuns(dir)
    expect(runs).toEqual([])
    expect(problems[0]).toMatch(/Publish a run first/)
  })

  test('complete runs pass', () => {
    publish('a')
    publish('b')
    writeFileSync(join(dir, 'runs.json'), JSON.stringify([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]))
    const { runs, problems } = checkRuns(dir)
    expect(runs).toHaveLength(2)
    expect(problems).toEqual([])
  })

  test('a run missing a file is named with the file, because that area would fail to load', () => {
    publish('a', RUN_FILES.filter((f) => f !== 'roads.geojson'))
    writeFileSync(join(dir, 'runs.json'), JSON.stringify([{ id: 'a', name: 'Area A' }]))
    expect(checkRuns(dir).problems).toEqual(['Area A: missing roads.geojson.'])
  })

  test('a list that is not JSON, or is empty, is a problem', () => {
    writeFileSync(join(dir, 'runs.json'), '<html>')
    expect(checkRuns(dir).problems[0]).toMatch(/not valid JSON/)
    writeFileSync(join(dir, 'runs.json'), '[]')
    expect(checkRuns(dir).problems).toEqual(['runs.json lists no runs.'])
  })

  test('folder size adds up every level', () => {
    mkdirSync(join(dir, 'x', 'y'), { recursive: true })
    writeFileSync(join(dir, 'a.bin'), Buffer.alloc(1000))
    writeFileSync(join(dir, 'x', 'y', 'b.bin'), Buffer.alloc(500))
    expect(folderSize(dir)).toBe(1500)
    expect(megabytes(1048576 * 2.5)).toBe('2.5')
  })
})
