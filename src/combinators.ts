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
    remainingInput: success.remainingInput,
  })
  return input => either.map(parser(input), replaceOutput)
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
  return input =>
    either.flatMap(parser(input), success => {
      const notResult = not(input)
      if (!either.isLeft(notResult)) {
        return either.makeLeft({
          input,
          message: errorMessage,
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
export const flatMap = <Output, NewOutput>(
  parser: Parser<Output>,
  f: (output: Output) => Parser<NewOutput>,
): Parser<NewOutput> => {
  const applyF = (success: Success<Output>) => {
    const nextParser = f(success.output)
    return nextParser(success.remainingInput)
  }
  return input => either.flatMap(parser(input), applyF)
}

/**
 * Create a `Parser` from a thunk. This can be useful for recursive parsers.
 */
export const lazy =
  <Output>(parser: () => Parser<Output>): Parser<Output> =>
  input =>
    parser()(input)

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
  return input =>
    either.flatMap(parser(input), success =>
      either.match(notFollowedBy(success.remainingInput), {
        left: _ => either.makeRight(success),
        right: _ =>
          either.makeLeft({
            input,
            message: errorMessage,
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
    remainingInput: success.remainingInput,
  })
  return input => either.map(parser(input), applyF)
}

/**
 * Apply the given `parsers` to the same input until one succeeds or all fail.
 */
export const oneOf = <
  Parsers extends readonly [
    Parser<unknown>,
    Parser<unknown>,
    ...(readonly Parser<unknown>[]),
  ],
>(
  parsers: Parsers,
): Parser<OneOfOutput<Parsers>> => {
  const [firstParser, ...otherParsers] = parsers
  return input => {
    const firstResult = firstParser(input)
    return otherParsers.reduce(
      (result: ReturnType<Parser<OneOfOutput<Parsers>>>, parser) =>
        either.isLeft(result) ? parser(input) : result,
      firstResult,
    )
  }
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
): Parser<readonly [Output, ...(readonly Output[])]> =>
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
  input => {
    const parseResult = parsers.reduce(
      (
        results: ReturnType<Parser<readonly SequenceOutput<Parsers>[number][]>>,
        parser,
      ) =>
        either.isRight(results)
          ? either.map(parser(results.value.remainingInput), newSuccess => ({
              remainingInput: newSuccess.remainingInput,
              output: [...results.value.output, newSuccess.output],
            }))
          : results,
      either.makeRight({ remainingInput: input, output: [] }), // `parsers` is non-empty so this is never returned
    )
    // The above `reduce` callback constructs `output` such that its
    // elements align with `Parsers`, but TypeScript doesn't know that.
    return parseResult as ParserResult<SequenceOutput<Parsers>>
  }
type SequenceOutput<Parsers extends readonly Parser<unknown>[]> = {
  [Index in keyof Parsers]: OutputOf<Parsers[Index]>
}

/**
 * Repeatedly apply `parser` to the input as long as it keeps succeeding.
 * Outputs are collected in an array.
 */
export const zeroOrMore =
  <Output>(
    parser: Parser<Output>,
  ): ParserWhichAlwaysSucceeds<readonly Output[]> =>
  // Uses a loop rather than recursion to avoid stack overflow.
  input => {
    const output: Output[] = []
    const mutableState = { output, remainingInput: input }

    let result = parser(mutableState.remainingInput)
    while (either.isRight(result)) {
      mutableState.output.push(result.value.output)
      mutableState.remainingInput = result.value.remainingInput
      result = parser(mutableState.remainingInput)
    }

    return either.makeRight(mutableState)
  }

type OutputOf<SpecificParser extends Parser<unknown>> = Extract<
  ReturnType<SpecificParser>['value'],
  Success<unknown>
>['output']
