import either, { type Either } from '@matt.kantor/either'
import { strict as assert, AssertionError } from 'node:assert'
import test, { suite } from 'node:test'
import {
  as,
  butNot,
  flatMap,
  hidden,
  labeled,
  lazy,
  lookaheadNot,
  map,
  oneOf,
  oneOrMore,
  sequence,
  zeroOrMore,
} from './combinators.js'
import {
  anySingleCharacter,
  literal,
  nothing,
  regularExpression,
} from './constructors.js'
import {
  parse,
  type InvalidInputError,
  type Parser,
  type ParserResult,
} from './parser.js'

suite('constructors', _ => {
  test('anySingleCharacter', _ => {
    assertSuccess(anySingleCharacter('a'), 'a')
    assertSuccess(anySingleCharacter('ab'), 'a')
    assertFailure(anySingleCharacter(''))
  })

  test('literal', _ => {
    assertSuccess(literal('a')('a'), 'a')
    assertSuccess(literal('a')('ab'), 'a')
    assertSuccess(literal('')('arbitrary input'), '')
    assertFailure(literal('a')('b'))
    assertFailure(literal('a')('ba'))
    assertFailure(literal('a')(''))
  })

  test('nothing', _ => {
    assertSuccess(nothing('a'), undefined)
    assertSuccess(nothing(''), undefined)
  })

  test('regularExpression', _ => {
    assertSuccess(regularExpression(/ab?/)('a'), 'a')
    assertSuccess(regularExpression(/ab?/)('ab'), 'ab')
    assertSuccess(regularExpression(/ab?/)('abc'), 'ab')
    assertSuccess(regularExpression(/.*/)('arbitrary input'), 'arbitrary input')
    assertFailure(regularExpression(/ab?/)('bab'))
  })
})

suite('combinators', _ => {
  test('as', _ => {
    assertSuccess(as(literal('a'), 'b')('a'), 'b')
    assertFailure(as(literal('a'), 'b')('b'))
  })

  test('butNot', _ => {
    const aOrBButNotB = butNot(regularExpression(/(?:a|b)/), literal('b'), 'b')
    assertSuccess(aOrBButNotB('a'), 'a')
    assertSuccess(aOrBButNotB('ab'), 'a')
    assertFailure(aOrBButNotB('b'))
  })

  test('flatMap', _ => {
    const characterFollowedByItsUppercase = flatMap(
      anySingleCharacter,
      character => literal(character.toUpperCase()),
    )
    assertSuccess(characterFollowedByItsUppercase('aA'), 'A')
    assertSuccess(characterFollowedByItsUppercase('aAB'), 'A')
    assertFailure(characterFollowedByItsUppercase('a'))
    assertFailure(characterFollowedByItsUppercase('A'))
    assertFailure(characterFollowedByItsUppercase('aa'))
    assertFailure(characterFollowedByItsUppercase('aB'))
  })

  test('lazy', _ => {
    const lazyA = lazy(() => a)
    const a = literal('a')
    assertSuccess(lazyA('a'), 'a')
    assertFailure(lazyA('b'))
  })

  test('lookaheadNot', _ => {
    const aNotFollowedByB = lookaheadNot(literal('a'), literal('b'), 'b')
    assertSuccess(aNotFollowedByB('a'), 'a')
    assertSuccess(aNotFollowedByB('az'), 'a')
    assertFailure(aNotFollowedByB('ab'))
    assertFailure(aNotFollowedByB('b'))
    assertFailure(aNotFollowedByB(''))
  })

  test('map', _ => {
    const characterAsItsUppercase = map(anySingleCharacter, character =>
      character.toUpperCase(),
    )
    assertSuccess(characterAsItsUppercase('a'), 'A')
    assertSuccess(characterAsItsUppercase('bb'), 'B')
    assertFailure(characterAsItsUppercase(''))
  })

  test('oneOf', _ => {
    const aOrB = oneOf([literal('a'), literal('b')])
    assertSuccess(aOrB('a'), 'a')
    assertSuccess(aOrB('ba'), 'b')
    assertFailure(aOrB('c'))
    assertFailure(aOrB(''))
  })

  test('oneOrMore', _ => {
    const oneOrMoreA = oneOrMore(literal('a'))
    assertSuccess(oneOrMoreA('a'), ['a'])
    assertSuccess(oneOrMoreA('aaab'), ['a', 'a', 'a'])
    assertFailure(oneOrMoreA(''))
    assertFailure(oneOrMoreA('b'))
    assertSuccess(
      oneOrMore(longInputElementParser)(longInput),
      longExpectedOutput,
    )
  })

  test('sequence', _ => {
    const ab = sequence([literal('a'), literal('b')])
    assertSuccess(ab('ab'), ['a', 'b'])
    assertSuccess(ab('abc'), ['a', 'b'])
    assertFailure(ab('bab'))
    assertSuccess(
      sequence([
        // Prove there are at least two parsers.
        longInputElementParser,
        longInputElementParser,
        ...Array.from(
          { length: longInputLength - 2 },
          _ => longInputElementParser,
        ),
      ])(longInput),
      longExpectedOutput,
    )
  })

  test('zeroOrMore', _ => {
    const zeroOrMoreA = zeroOrMore(literal('a'))
    assertSuccess(zeroOrMoreA('a'), ['a'])
    assertSuccess(zeroOrMoreA('aaab'), ['a', 'a', 'a'])
    assertSuccess(zeroOrMoreA(''), [])
    assertSuccess(zeroOrMoreA('b'), [])
    assertSuccess(
      zeroOrMore(longInputElementParser)(longInput),
      longExpectedOutput,
    )
  })
})

test('parse', _ => {
  assertRight(parse(literal('a'), 'a'), 'a')
  assertFailure(parse(literal('a'), 'b'))
  assertFailure(parse(literal('a'), 'ab'))
})

suite('failure offsets', _ => {
  test('failures carry an offset and expectation', _ => {
    assertFailureWithDetails(literal('a')('b'), {
      expected: new Set(['`a`']),
      offset: 0n,
    })
    assertSuccess(literal('a')('xa', 1n), 'a')
    assertFailureWithDetails(literal('a')('xb', 1n), {
      offset: 1n,
    })
  })

  test('sequence reports the offset of the element that failed', _ => {
    const ab = sequence([literal('a'), literal('b')])
    assertFailureWithDetails(ab('ax'), {
      expected: new Set(['`b`']),
      offset: 1n,
    })
  })

  test('oneOf reports the furthest alternative and merges ties', _ => {
    // Both alternatives consume 'a' before failing at offset 1.
    const ab = sequence([literal('a'), literal('b')])
    const ac = sequence([literal('a'), literal('c')])
    const result = oneOf([ab, ac])('axd')
    assertFailureWithDetails(result, {
      expected: new Set(['`b`', '`c`']),
      message: 'expected one of: `b`, `c`',
      offset: 1n,
    })
  })

  test('a nested oneOf inside a sequence merges expectations', _ => {
    const parser = sequence([literal('a'), oneOf([literal('b'), literal('c')])])
    const result = parser('ax')
    assertFailureWithDetails(result, {
      expected: new Set(['`b`', '`c`']),
      message: 'expected one of: `b`, `c`',
      offset: 1n,
    })
  })

  test('parse reports leaf and excess-content offsets', _ => {
    assertFailureWithDetails(parse(literal('a'), 'b'), { offset: 0n })
    const excess = parse(literal('a'), 'ab')
    assertFailureWithDetails(excess, {
      message: 'excess content followed valid input',
      offset: 1n,
    })
  })
})

suite('furthest failures survive backtracking', _ => {
  test('a shorter alternative succeeding does not erase a deeper failure', _ => {
    const result = oneOf([
      sequence([literal('a'), literal('b'), literal('c')]),
      literal('a'),
    ])('abx')
    assertSuccess(result, 'a')
    assertFurthestFailure(result, {
      expected: new Set(['`c`']),
      offset: 2n,
    })
  })

  test('an optional parser still reports where it failed', _ => {
    const result = oneOf([sequence([literal('a'), literal('b')]), nothing])(
      'ax',
    )
    assertFurthestFailure(result, {
      expected: new Set(['`b`']),
      offset: 1n,
    })
  })

  test('zeroOrMore keeps the failure which ended the repetition', _ => {
    // Two `ab`s are consumed, then a third iteration gets as far as 'a'.
    const result = zeroOrMore(sequence([literal('a'), literal('b')]))('ababa')
    assertFurthestFailure(result, {
      expected: new Set(['`b`']),
      offset: 5n,
    })
  })

  test('parse prefers a carried failure', _ => {
    assertFailureWithDetails(
      parse(
        oneOf([
          sequence([literal('a'), literal('b'), literal('c')]),
          literal('a'),
        ]),
        'abx',
      ),
      {
        expected: new Set(['`c`']),
        message: 'expected `c`',
        offset: 2n,
      },
    )

    assertFailureWithDetails(
      parse(
        oneOf([sequence([literal('a'), literal('b')]), literal('a')]),
        'ax',
      ),
      {
        expected: new Set(['`b`', 'end of input']),
        message: 'expected one of: `b`, end of input',
        offset: 1n,
      },
    )
  })

  test('notes travel with failures and merge on ties', _ => {
    const note = { offset: 0n, message: 'opened here' }
    const alwaysFailsWithNote: Parser<never> = (input, offset = 0n) =>
      either.makeLeft({
        source: input,
        offset,
        message: 'no good',
        expected: new Set(['something else']),
        notes: [note],
      })
    assertFailureWithDetails(oneOf([alwaysFailsWithNote, literal('z')])('x'), {
      expected: new Set(['something else', '`z`']),
      notes: [note],
      offset: 0n,
    })
  })
})

suite('hidden', _ => {
  test('contributes no expectations when something else failed', _ => {
    const result = oneOf([hidden(literal('a')), literal('b')])('x')
    assertFailureWithDetails(result, {
      expected: new Set(['`b`']),
      message: 'expected `b`',
      offset: 0n,
    })
  })
})

suite('labeled', _ => {
  test('replaces expectations when nothing was consumed', _ => {
    const ab = labeled(sequence([literal('a'), literal('b')]), 'an ab')
    assertFailureWithDetails(ab('xx'), {
      expected: new Set(['an ab']),
      message: 'expected an ab',
      offset: 0n,
    })
  })

  test('defers to a failure which got further', _ => {
    const ab = labeled(sequence([literal('a'), literal('b')]), 'an ab')
    assertFailureWithDetails(ab('ax'), {
      expected: new Set(['`b`']),
      message: 'input did not begin with `b`',
      offset: 1n,
    })
  })

  test('relabels a carried failure sitting where the parse ended', _ => {
    const someAs = labeled(zeroOrMore(literal('a')), 'a run of `a`s')
    assertFurthestFailure(someAs('aaab'), {
      expected: new Set(['a run of `a`s']),
      message: 'expected a run of `a`s',
      offset: 3n,
    })
  })
})

test('README example', _ => {
  const operator = oneOf([literal('+'), literal('-')])

  const number = map(
    oneOrMore(
      oneOf([
        literal('0'),
        literal('1'),
        literal('2'),
        literal('3'),
        literal('4'),
        literal('5'),
        literal('6'),
        literal('7'),
        literal('8'),
        literal('9'),
      ]),
    ),
    Number,
  )

  const compoundExpression = map(
    sequence([number, operator, lazy(() => expression)]),
    ([a, operator, b]) => {
      switch (operator) {
        case '+':
          return a + b
        case '-':
          return a - b
      }
    },
  )

  const expression: Parser<number> = oneOf([compoundExpression, number])

  assertRight(parse(expression, '2+2-1'), 3)
})

const longInputLength = 10000
const longInput = 'a'.repeat(longInputLength)
const longInputElementParser = literal('a')
const longExpectedOutput = Array.from(
  { length: longInputLength },
  _ => 'a' as const,
)

const adjustStartStackFn = (
  error: AssertionError,
  stackStartFn: (...args: never) => unknown,
) =>
  new AssertionError({
    actual: error.actual,
    expected: error.expected,
    operator: error.operator,
    stackStartFn,
    ...(error.generatedMessage ? {} : { message: error.message }),
  })

const customAssertions = (
  stackStartFn: (...args: never) => unknown,
  functionPerformingAssertions: () => void,
) => {
  try {
    functionPerformingAssertions()
  } catch (error) {
    if (!(error instanceof AssertionError)) {
      throw error
    } else {
      throw adjustStartStackFn(error, stackStartFn)
    }
  }
}

const assertRight = <RightValue>(
  actualResult: Either<unknown, RightValue>,
  expectedRightValue: RightValue,
) =>
  customAssertions(assertRight, () => {
    if (either.isLeft(actualResult)) {
      assert.fail('result was left; expected right')
    }
    assert.deepEqual(actualResult.value, expectedRightValue)
  })

const assertSuccess = <Output>(
  actualResult: ParserResult<Output>,
  expectedOutput: Output,
) =>
  customAssertions(assertSuccess, () => {
    if (either.isLeft(actualResult)) {
      assert.fail('result was failure; expected success')
    }
    assert.deepEqual(actualResult.value.output, expectedOutput)
  })

const assertFailure = <Output>(
  actualResult: Either<InvalidInputError, Output>,
) =>
  customAssertions(assertFailure, () =>
    assert(
      either.isLeft(actualResult),
      'result was successful; expected failure',
    ),
  )

const assertFailureWithDetails = (
  actualResult: Either<InvalidInputError, unknown>,
  expectedDetails: Partial<InvalidInputError>,
) =>
  customAssertions(assertFailureWithDetails, () =>
    either.match(actualResult, {
      left: error => assert.partialDeepStrictEqual(error, expectedDetails),
      right: _ => assert.fail('result was successful; expected failure'),
    }),
  )

const assertFurthestFailure = (
  actualResult: ParserResult<unknown>,
  expectedDetails: Partial<InvalidInputError>,
) =>
  customAssertions(assertFurthestFailure, () =>
    either.match(actualResult, {
      left: _ => assert.fail('result was failure; expected success'),
      right: success =>
        success.furthestFailure === undefined
          ? assert.fail('success carried no furthest failure')
          : assert.partialDeepStrictEqual(
              success.furthestFailure,
              expectedDetails,
            ),
    }),
  )
