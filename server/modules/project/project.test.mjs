// Run: npm test --prefix server
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanProject, parseProject, validPath } from '../../project.js'
import { cleanContent } from '../../catalog.js'

test('paths: folders yes, escapes no', () => {
  assert.ok(validPath('src/models/Car.java'))
  for (const bad of ['../x', '/abs', 'a//b', 'a b.java', '', 'x/'.repeat(10) + 'y']) assert.equal(validPath(bad), false, bad)
})

test('old answers (plain code) read as one file', () => {
  assert.deepEqual(parseProject('print(1)', 'python'), { files: [{ path: 'main.py', content: 'print(1)' }], folders: [] })
  assert.deepEqual(parseProject('{ int x; }', 'cpp').files[0].path, 'main.cpp') // code that starts with "{" isn't JSON
})

test('clean: drops bad paths and duplicates, adds parent folders, empty is ""', () => {
  const p = JSON.parse(cleanProject(JSON.stringify({ files: [{ path: 'src/a/B.java', content: 'x' }, { path: 'src/a/B.java', content: 'dup' }, { path: '../evil', content: 'y' }], folders: ['docs'] })))
  assert.deepEqual(p.files, [{ path: 'src/a/B.java', content: 'x' }])
  assert.deepEqual(p.folders, ['docs', 'src', 'src/a'])
  assert.equal(cleanProject(''), '')
})

test('cleanContent stores code fields as a project', () => {
  const c = cleanContent('lld', { language: 'java', fields: { code: 'class A {}' } })
  assert.deepEqual(JSON.parse(c.fields.code).files, [{ path: 'Main.java', content: 'class A {}' }])
})
