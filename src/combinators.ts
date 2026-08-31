import * as either from '@matt.kantor/either'
import type {
  InvalidInputError,
  Note,
  Parser,
  ParserResult,
  ParserWhichAlwaysSucceeds,
  Success,
} from './parser.js'
import {
  deduplicateNotes,
  furthest,
  furthestOrUndefined,
  messageForExpectations,
} from './internal.js'

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
    furthestFailure: success.furthestFailure,
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
  const expected = new Set([`not ${notName}`])
  return (input, offset = 0n) =>
    either.flatMap(parser(input, offset), success => {
      const notResult = not(input, offset)
      if (!either.isLeft(notResult)) {
        const newError = {
          source: input,
          offset,
          message: errorMessage,
          expected,
          notes: [],
        }
        return either.makeLeft(
          success.furthestFailure === undefined
            ? newError
            : furthest(success.furthestFailure, newError),
        )
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
      withPotentiallyFurtherFailure(success.furthestFailure)(
        f(success.output)(input, success.offset),
      ),
    )

/**
 * Omit `parser`'s expected values from errors.
 *
 * Intended for parsers whose absence is unsurprising, e.g. in many languages
 * optional whitespace can appear almost anywhere and isn't useful to report in
 * error messages.
 *
 * @example
 * ```ts
 * oneOf([hidden(whitespace), nothing])
 * ```
 */
export const hidden = <Output>(parser: Parser<Output>): Parser<Output> =>
  withExpectations(parser, noExpectations)

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
  const expected = new Set([`not followed by ${followedByName}`])
  return (input, offset = 0n) =>
    either.flatMap(parser(input, offset), success =>
      either.match(notFollowedBy(input, success.offset), {
        left: _ => either.makeRight(success),
        right: _ => {
          const newError = {
            source: input,
            offset: success.offset,
            message: errorMessage,
            expected,
            notes: [],
          }
          return either.makeLeft(
            success.furthestFailure === undefined
              ? newError
              : furthest(success.furthestFailure, newError),
          )
        },
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
    furthestFailure: success.furthestFailure,
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
    const mutableFurthestNotes: Note[] = []
    let mutableFurthestOffset = -1n
    for (const parser of parsers) {
      const result = parser(input, offset)
      if (either.isLeft(result)) {
        const error = result.value
        if (error.offset > mutableFurthestOffset) {
          mutableFurthestOffset = error.offset
          mutableFurthestExpectations.length = 0
          mutableFurthestNotes.length = 0
          mutableFurthestExpectations.push(...error.expected)
          mutableFurthestNotes.push(...error.notes)
        } else if (error.offset === mutableFurthestOffset) {
          mutableFurthestExpectations.push(...error.expected)
          mutableFurthestNotes.push(...error.notes)
        }
      } else {
        // Success!
        return mutableFurthestOffset < 0n
          ? result
          : either.makeRight({
              ...result.value,
              furthestFailure: furthestOrUndefined(
                result.value.furthestFailure,
                failureAt(
                  input,
                  mutableFurthestOffset,
                  mutableFurthestExpectations,
                  mutableFurthestNotes,
                ),
              ),
            })
      }
    }

    // If we haven't already returned then parsing failed.
    return either.makeLeft(
      failureAt(
        input,
        mutableFurthestOffset,
        mutableFurthestExpectations,
        mutableFurthestNotes,
      ),
    )
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
          ? either.map(
              withPotentiallyFurtherFailure(results.value.furthestFailure)(
                parser(input, results.value.offset),
              ),
              newSuccess => ({
                offset: newSuccess.offset,
                output: [...results.value.output, newSuccess.output],
                furthestFailure: newSuccess.furthestFailure,
              }),
            )
          : results,
      either.makeRight({ offset, output: [], furthestFailure: undefined }), // `parsers` is non-empty so this is never returned
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
    const mutableState: {
      output: Output[]
      offset: bigint
      furthestFailure: InvalidInputError | undefined
    } = { output, offset, furthestFailure: undefined }

    let result = parser(input, mutableState.offset)
    while (either.isRight(result)) {
      mutableState.output.push(result.value.output)
      mutableState.offset = result.value.offset
      mutableState.furthestFailure = furthestOrUndefined(
        mutableState.furthestFailure,
        result.value.furthestFailure,
      )
      result = parser(input, mutableState.offset)
    }

    return either.makeRight({
      ...mutableState,
      furthestFailure: furthestOrUndefined(
        mutableState.furthestFailure,
        result.value,
      ),
    })
  }

const noExpectations: ReadonlySet<string> = new Set()

const withExpectations = <Output>(
  parser: Parser<Output>,
  expected: ReadonlySet<string>,
): Parser<Output> => {
  const message = messageForExpectations(expected)
  const relabeled = (error: InvalidInputError) => ({
    ...error,
    message,
    expected,
  })
  return (input, offset = 0n) =>
    either.match(parser(input, offset), {
      left: error =>
        either.makeLeft(error.offset === offset ? relabeled(error) : error),
      right: success =>
        either.makeRight(
          success.furthestFailure !== undefined &&
            success.furthestFailure.offset === success.offset
            ? {
                ...success,
                furthestFailure: relabeled(success.furthestFailure),
              }
            : success,
        ),
    })
}

const failureAt = (
  input: string,
  offset: bigint,
  expectations: readonly string[],
  notes: readonly Note[],
): InvalidInputError => {
  const expected = new Set(expectations)
  return {
    source: input,
    offset,
    message: messageForExpectations(expected),
    expected,
    notes: deduplicateNotes(notes),
  }
}

const withPotentiallyFurtherFailure =
  (carried: InvalidInputError | undefined) =>
  <Output>(result: ParserResult<Output>): ParserResult<Output> =>
    carried === undefined
      ? result
      : either.match(result, {
          left: error => either.makeLeft(furthest(carried, error)),
          right: success =>
            either.makeRight({
              ...success,
              furthestFailure: furthestOrUndefined(
                carried,
                success.furthestFailure,
              ),
            }),
        })

type OutputOf<SpecificParser extends Parser<unknown>> = Extract<
  ReturnType<SpecificParser>['value'],
  Success<unknown>
>['output']
