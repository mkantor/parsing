import * as either from '@matt.kantor/either'
import type {
  Parser,
  ParserResult,
  ParserWhichAlwaysSucceeds,
  Success,
} from './parser.js'

/**
 * Substitute the output of a successful parse.
 */
export const as = <NewOutput>(
  parser: Parser<unknown>,
  newOutput: NewOutput,
): Parser<NewOutput> => {
  const replaceOutput = (success: Success<unknown>) => ({
    output: newOutput,
    offset: success.offset,
  })
  return (input, offset = 0n) =>
    either.map(parser(input, offset), replaceOutput)
}

/**
 * Attempt to parse input with `parser`. If successful, ensure the same input
 * does _not_ successfully parse with `not`.
 *
 * @example
 * ```ts
 * butNot(anySingleCharacter, literal('a'), 'the letter a') // parses any character besides 'a'
 * ```
 */
export const butNot = <Output>(
  parser: Parser<Output>,
  not: Parser<unknown>,
  notName: string,
): Parser<Output> => {
  const errorMessage = `input was unexpectedly ${notName}`
  return (input, offset = 0n) =>
    either.flatMap(parser(input, offset), success => {
      const notResult = not(input, offset)
      if (!either.isLeft(notResult)) {
        return either.makeLeft({
          source: input,
          offset,
          message: errorMessage,
          expected: [`not ${notName}`],
        })
      } else {
        return either.makeRight(success)
      }
    })
}

/**
 * Map the output of `parser` to another `Parser` which is then applied to the
 * remaining input, returning the result of the second parser upon success.
 */
export const flatMap =
  <Output, NewOutput>(
    parser: Parser<Output>,
    f: (output: Output) => Parser<NewOutput>,
  ): Parser<NewOutput> =>
  (input, offset = 0n) =>
    either.flatMap(parser(input, offset), success =>
      f(success.output)(input, success.offset),
    )

/**
 * Create a `Parser` from a thunk. This can be useful for recursive parsers.
 */
export const lazy =
  <Output>(parser: () => Parser<Output>): Parser<Output> =>
  (input, offset = 0n) =>
    parser()(input, offset)

/**
 * Attempt to parse input with `parser`. If successful, ensure the remaining
 * input does _not_ successfully parse with `notFollowedBy`.
 *
 * @example
 * ```ts
 * lookaheadNot(anySingleCharacter, literal('a'), 'the letter a') // parses the first character of 'ab', but not 'aa'
 * ```
 */
export const lookaheadNot = <Output>(
  parser: Parser<Output>,
  notFollowedBy: Parser<unknown>,
  followedByName: string,
): Parser<Output> => {
  const errorMessage = `input was unexpectedly followed by ${followedByName}`
  return (input, offset = 0n) =>
    either.flatMap(parser(input, offset), success =>
      either.match(notFollowedBy(input, success.offset), {
        left: _ => either.makeRight(success),
        right: _ =>
          either.makeLeft({
            source: input,
            offset: success.offset,
            message: errorMessage,
            expected: [`not followed by ${followedByName}`],
          }),
      }),
    )
}

/**
 * Map the output of `parser` to new output.
 */
export const map = <Output, NewOutput>(
  parser: Parser<Output>,
  f: (output: Output) => NewOutput,
): Parser<NewOutput> => {
  const applyF = (success: Success<Output>) => ({
    output: f(success.output),
    offset: success.offset,
  })
  return (input, offset = 0n) => either.map(parser(input, offset), applyF)
}

/**
 * Apply the given `parsers` to the same input until one succeeds or all fail.
 * When all fail, the error which reached the furthest offset is returned; if
 * several reached the same furthest offset their expectations are merged.
 */
export const oneOf =
  <
    Parsers extends readonly [
      Parser<unknown>,
      Parser<unknown>,
      ...(readonly Parser<unknown>[]),
    ],
  >(
    parsers: Parsers,
  ): Parser<OneOfOutput<Parsers>> =>
  (input, offset = 0n) => {
    // To avoid copies (for performance reasons), local mutable state + an
    // imperative loop is used rather than simply reducing `parsers`.
    const mutableFurthestExpectations: string[] = []
    let mutableFurthestOffset = -1n
    for (const parser of parsers) {
      const result = parser(input, offset)
      if (either.isLeft(result)) {
        const error = result.value
        if (error.offset > mutableFurthestOffset) {
          mutableFurthestOffset = error.offset
          mutableFurthestExpectations.length = 0
          mutableFurthestExpectations.push(...error.expected)
        } else if (error.offset === mutableFurthestOffset) {
          mutableFurthestExpectations.push(...error.expected)
        }
      } else {
        // Success!
        return result
      }
    }

    // TODO: Consider changing `InvalidInputError['expected']` to be a `Set`.
    const expected = [...new Set(mutableFurthestExpectations)]

    // If we haven't already returned then parsing failed.
    return either.makeLeft({
      source: input,
      offset: mutableFurthestOffset,
      expected: expected,
      message:
        expected.length > 1
          ? `expected one of: ${expected.join(', ')}`
          : `expected ${expected[0]}`,
    })
  }
type OneOfOutput<Parsers extends readonly Parser<unknown>[]> = {
  [Index in keyof Parsers]: OutputOf<Parsers[Index]>
}[number]

/**
 * Repeatedly apply `parser` to the input as long as it keeps succeeding,
 * requiring at least one success. Outputs are collected in an array.
 */
export const oneOrMore = <Output>(
  parser: Parser<Output>,
): Parser<[Output, ...(readonly Output[])]> =>
  map(sequence([parser, zeroOrMore(parser)]), ([head, tail]) => [head, ...tail])

/**
 * Apply the given `parsers` in order to the input, requiring all to succeed.
 */
export const sequence =
  <
    const Parsers extends readonly [
      Parser<unknown>,
      Parser<unknown>,
      ...(readonly Parser<unknown>[]),
    ],
  >(
    parsers: Parsers,
  ): Parser<SequenceOutput<Parsers>> =>
  (input, offset = 0n) => {
    const parseResult = parsers.reduce(
      (
        results: ReturnType<Parser<readonly SequenceOutput<Parsers>[number][]>>,
        parser,
      ) =>
        either.isRight(results)
          ? either.map(parser(input, results.value.offset), newSuccess => ({
              offset: newSuccess.offset,
              output: [...results.value.output, newSuccess.output],
            }))
          : results,
      either.makeRight({ offset, output: [] }), // `parsers` is non-empty so this is never returned
    )
    // The above `reduce` callback constructs `output` such that its
    // elements align with `Parsers`, but TypeScript doesn't know that.
    return parseResult as ParserResult<SequenceOutput<Parsers>>
  }
type SequenceOutput<Parsers extends readonly Parser<unknown>[]> = {
  -readonly [Index in keyof Parsers]: OutputOf<Parsers[Index]>
}

/**
 * Repeatedly apply `parser` to the input as long as it keeps succeeding.
 * Outputs are collected in an array.
 */
export const zeroOrMore =
  <Output>(parser: Parser<Output>): ParserWhichAlwaysSucceeds<Output[]> =>
  // Uses a loop rather than recursion to avoid stack overflow.
  (input, offset = 0n) => {
    const output: Output[] = []
    const mutableState = { output, offset }

    let result = parser(input, mutableState.offset)
    while (either.isRight(result)) {
      mutableState.output.push(result.value.output)
      mutableState.offset = result.value.offset
      result = parser(input, mutableState.offset)
    }

    return either.makeRight(mutableState)
  }

type OutputOf<SpecificParser extends Parser<unknown>> = Extract<
  ReturnType<SpecificParser>['value'],
  Success<unknown>
>['output']
