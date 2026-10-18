// Fixed problem set for V0. Single source of truth: the server seeds starter
// code from here and serves the list to the client at GET /api/problems.

export const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
]

import { ROOM_TESTS } from './room-tests.js'

const RAW = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    category: 'DSA',
    description:
      'Given an array of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`.\n\nYou may assume exactly one solution exists, and you may not use the same element twice.',
    examples: [
      { input: 'nums = [2,7,11,15], target = 9', output: '[0,1]' },
      { input: 'nums = [3,2,4], target = 6', output: '[1,2]' },
    ],
    constraints: ['2 ≤ nums.length ≤ 10^4', '-10^9 ≤ nums[i] ≤ 10^9', 'Exactly one valid answer exists'],
    starter: {
      javascript: 'function twoSum(nums, target) {\n  \n}\n',
      python: 'def two_sum(nums, target):\n    pass\n',
    },
  },
  {
    id: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    category: 'DSA',
    description:
      'Given a string `s` containing only the characters `()[]{}`, decide whether it is valid.\n\nA string is valid if every open bracket is closed by the same type of bracket, in the correct order.',
    examples: [
      { input: 's = "()[]{}"', output: 'true' },
      { input: 's = "(]"', output: 'false' },
      { input: 's = "([)]"', output: 'false' },
    ],
    constraints: ['1 ≤ s.length ≤ 10^4'],
    starter: {
      javascript: 'function isValid(s) {\n  \n}\n',
      python: 'def is_valid(s):\n    pass\n',
    },
  },
  {
    id: 'longest-substring',
    title: 'Longest Substring Without Repeats',
    difficulty: 'Medium',
    category: 'DSA',
    description:
      'Given a string `s`, return the length of the longest substring that contains no repeated characters.',
    examples: [
      { input: 's = "abcabcbb"', output: '3  ("abc")' },
      { input: 's = "bbbbb"', output: '1' },
      { input: 's = "pwwkew"', output: '3  ("wke")' },
    ],
    constraints: ['0 ≤ s.length ≤ 5 * 10^4'],
    starter: {
      javascript: 'function lengthOfLongestSubstring(s) {\n  \n}\n',
      python: 'def length_of_longest_substring(s):\n    pass\n',
    },
  },
  {
    id: 'merge-intervals',
    title: 'Merge Intervals',
    difficulty: 'Medium',
    category: 'DSA',
    description:
      'Given an array of `intervals` where `intervals[i] = [start, end]`, merge all overlapping intervals and return the non-overlapping intervals that cover all the input.',
    examples: [
      { input: 'intervals = [[1,3],[2,6],[8,10],[15,18]]', output: '[[1,6],[8,10],[15,18]]' },
      { input: 'intervals = [[1,4],[4,5]]', output: '[[1,5]]' },
    ],
    constraints: ['1 ≤ intervals.length ≤ 10^4', 'start ≤ end'],
    starter: {
      javascript: 'function merge(intervals) {\n  \n}\n',
      python: 'def merge(intervals):\n    pass\n',
    },
  },
  {
    id: 'number-of-islands',
    title: 'Number of Islands',
    difficulty: 'Medium',
    category: 'DSA',
    description:
      "Given an `m x n` grid of `'1'` (land) and `'0'` (water), return the number of islands.\n\nAn island is land connected horizontally or vertically, surrounded by water.",
    examples: [
      {
        input: 'grid = [\n ["1","1","0","0"],\n ["1","1","0","0"],\n ["0","0","1","0"],\n ["0","0","0","1"]\n]',
        output: '3',
      },
    ],
    constraints: ['1 ≤ m, n ≤ 300'],
    starter: {
      javascript: 'function numIslands(grid) {\n  \n}\n',
      python: 'def num_islands(grid):\n    pass\n',
    },
  },
  {
    id: 'lru-cache',
    title: 'LRU Cache',
    difficulty: 'Medium',
    category: 'DSA',
    description:
      'Design a cache with a fixed `capacity` that evicts the least recently used key when full.\n\nImplement `get(key)` (returns the value or -1) and `put(key, value)`. Both should run in O(1) average time.',
    examples: [
      {
        input: 'cache = LRUCache(2)\nput(1,1); put(2,2); get(1); put(3,3); get(2)',
        output: 'get(1) → 1, get(2) → -1  (2 was evicted)',
      },
    ],
    constraints: ['1 ≤ capacity ≤ 3000', 'Up to 2 * 10^5 calls'],
    starter: {
      javascript:
        'class LRUCache {\n  constructor(capacity) {\n    \n  }\n\n  get(key) {\n    \n  }\n\n  put(key, value) {\n    \n  }\n}\n',
      python:
        'class LRUCache:\n    def __init__(self, capacity):\n        pass\n\n    def get(self, key):\n        pass\n\n    def put(self, key, value):\n        pass\n',
    },
  },
  {
    id: 'debug-binary-search',
    title: 'Debug: Binary Search',
    difficulty: 'Easy',
    category: 'Debugging',
    description:
      'This binary search should return the index of `target` in a sorted array, or -1. It loops forever on some inputs and misses the target on others.\n\nFind every bug and explain why each one happens.',
    examples: [
      { input: 'nums = [1,3,5,7], target = 7', output: '3' },
      { input: 'nums = [1,3,5,7], target = 4', output: '-1' },
    ],
    constraints: ['nums is sorted ascending', 'Values are distinct'],
    starter: {
      javascript:
        'function search(nums, target) {\n  let lo = 0, hi = nums.length;\n  while (lo < hi) {\n    const mid = Math.floor((lo + hi) / 2);\n    if (nums[mid] === target) return mid;\n    if (nums[mid] < target) lo = mid;\n    else hi = mid - 1;\n  }\n  return -1;\n}\n',
      python:
        'def search(nums, target):\n    lo, hi = 0, len(nums)\n    while lo < hi:\n        mid = (lo + hi) // 2\n        if nums[mid] == target:\n            return mid\n        if nums[mid] < target:\n            lo = mid\n        else:\n            hi = mid - 1\n    return -1\n',
    },
  },
]

// Every room problem carries its test cases, so the room can run code in the browser.
export const PROBLEMS = RAW.map((p) => ({ ...p, tests: ROOM_TESTS[p.id] || null }))
