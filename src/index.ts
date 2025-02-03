import * as combinators from './combinators.js'
import * as constructors from './constructors.js'
import * as parser from './parser.js'

const parsing = { ...combinators, ...constructors, ...parser }
export default parsing

export * from './combinators.js'
export * from './constructors.js'
export * from './parser.js'
