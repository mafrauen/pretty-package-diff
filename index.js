import { parseLockfile, sortResolved } from './yarn.js'

export function run () {
  return parseLockfile(process.stdin)
    .then(sortResolved)
}
