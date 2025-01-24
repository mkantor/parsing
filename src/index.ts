import * as combinators from './combinators.js'
import * as constructors from './constructors.js'

const parsing = { ...combinators, ...constructors }
export default parsing

export * from './combinators.js'
export * from './constructors.js'
export * from './parser.js'
