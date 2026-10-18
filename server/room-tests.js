// Test cases for the room's classic problems (see client/src/lib/runner/harness.js for the format).
// Samples show their input and expected output; hidden ones only pass / fail. Checked against
// reference solutions in modules/problems/tests.test.mjs.
const fn = (js, py, params, samples, hidden, compare = 'exact') => ({ kind: 'function', entry: { javascript: js, python: py }, params, compare, samples, hidden })
const c = (args, expected) => ({ args, expected })

export const ROOM_TESTS = {
  'two-sum': fn('twoSum', 'two_sum', ['nums', 'target'],
    [c([[2, 7, 11, 15], 9], [0, 1]), c([[3, 2, 4], 6], [1, 2])],
    [c([[3, 3], 6], [0, 1]), c([[-1, -2, -3, -4, -5], -8], [2, 4]), c([[0, 4, 3, 0], 0], [0, 3]), c([[1, 5, 9, 13], 22], [2, 3])],
    'unordered'),
  'valid-parentheses': fn('isValid', 'is_valid', ['s'],
    [c(['()'], true), c(['()[]{}'], true), c(['(]'], false)],
    [c(['([)]'], false), c(['{[]}'], true), c(['(('], false), c([']'], false), c(['([]{})'], true)]),
  'longest-substring': fn('lengthOfLongestSubstring', 'length_of_longest_substring', ['s'],
    [c(['abcabcbb'], 3), c(['bbbbb'], 1), c(['pwwkew'], 3)],
    [c([''], 0), c([' '], 1), c(['dvdf'], 3), c(['abba'], 2), c(['tmmzuxt'], 5)]),
  'merge-intervals': fn('merge', 'merge', ['intervals'],
    [c([[[1, 3], [2, 6], [8, 10], [15, 18]]], [[1, 6], [8, 10], [15, 18]]), c([[[1, 4], [4, 5]]], [[1, 5]])],
    [c([[[1, 4], [0, 4]]], [[0, 4]]), c([[[1, 4], [2, 3]]], [[1, 4]]), c([[[5, 6]]], [[5, 6]]), c([[[2, 3], [4, 5], [6, 7], [8, 9], [1, 10]]], [[1, 10]])],
    'unordered'),
  'number-of-islands': fn('numIslands', 'num_islands', ['grid'],
    [c([[['1', '1', '0', '0'], ['1', '1', '0', '0'], ['0', '0', '1', '0'], ['0', '0', '0', '1']]], 3), c([[['1', '1', '1'], ['0', '1', '0'], ['1', '1', '1']]], 1)],
    [c([[['0']]], 0), c([[['1', '0', '1', '0', '1']]], 3), c([[['1', '1', '0'], ['0', '1', '0'], ['0', '0', '1']]], 2), c([[['1'], ['1'], ['0'], ['1']]], 2)]),
  'lru-cache': {
    kind: 'class', entry: { javascript: 'LRUCache', python: 'LRUCache' },
    samples: [{ ops: [['new', 2], ['put', 1, 1], ['put', 2, 2], ['get', 1], ['put', 3, 3], ['get', 2], ['put', 4, 4], ['get', 1], ['get', 3], ['get', 4]], expected: [null, null, null, 1, null, -1, null, -1, 3, 4] }],
    hidden: [
      { ops: [['new', 1], ['put', 2, 1], ['get', 2], ['put', 3, 2], ['get', 2], ['get', 3]], expected: [null, null, 1, null, -1, 2] },
      { ops: [['new', 2], ['put', 1, 1], ['put', 2, 2], ['put', 1, 10], ['put', 3, 3], ['get', 1], ['get', 2], ['get', 3]], expected: [null, null, null, null, null, 10, -1, 3] },
      { ops: [['new', 2], ['put', 1, 1], ['put', 2, 2], ['get', 1], ['put', 3, 3], ['get', 2], ['get', 1]], expected: [null, null, null, 1, null, -1, 1] },
    ],
  },
  'debug-binary-search': fn('search', 'search', ['nums', 'target'],
    [c([[1, 3, 5, 7], 7], 3), c([[1, 3, 5, 7], 4], -1)],
    [c([[1, 3, 5, 7], 1], 0), c([[2], 2], 0), c([[2], 3], -1), c([[], 5], -1), c([[1, 3, 5, 7, 9, 11], 9], 4), c([[1, 3, 5, 7, 9, 11], 0], -1)]),
}
