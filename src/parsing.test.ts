import either, { type Either } from '@matt.kantor/either'
import { strict as assert, AssertionError } from 'node:assert'
import test, { suite } from 'node:test'
import {
  as,
  butNot,
  flatMap,
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

  const evaluate = (input: string) =>
    either.flatMap(expression(input), ({ remainingInput, output }) =>
      remainingInput.length !== 0
        ? either.makeLeft('excess content followed valid input')
        : either.makeRight(output),
    )

  assertRight(evaluate('2+2-1'), 3)
})

const longInputLength = 10000
const longInput = 'a'.repeat(longInputLength)
const longInputElementParser = literal('a')
// Written oddly to prove non-emptiness.
const longExpectedOutput = [
  'a',
  ...Array.from({ length: longInputLength - 1 }, _ => 'a' as const),
] as const

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
