import type { Either, Right } from '@matt.kantor/either'
import * as either from '@matt.kantor/either'
import { furthest } from './internal.js'

export type InvalidInputError = {
  readonly source: string
  readonly offset: bigint
  readonly message: string
  readonly expected: ReadonlySet<string>
  readonly notes: readonly Note[]
}

/**
 * A secondary point in the source which helps explain a failure, such as the
 * position of an opening delimiter which was never closed.
 */
export type Note = {
  readonly offset: bigint
  readonly message: string
}

export type Parser<Output> = (
  input: string,
  offset?: bigint,
) => ParserResult<Output>

export type ParserWhichAlwaysSucceeds<Output> = (
  input: string,
  offset?: bigint,
) => Right<Success<Output>>

export type ParserResult<Output> = Either<InvalidInputError, Success<Output>>

export type Success<Output> = {
  readonly offset: bigint
  readonly output: Output
  /**
   * The furthest failure encountered while producing this success, if any.
   */
  readonly furthestFailure: InvalidInputError | undefined
}

/**
 * Apply `parser` to the given `input`, requiring it to consume the entire input
 * (all the way to the end of the string).
 *
 * Unlike `Parser`s, in the return value `Output` is not wrapped in `Success`
 * (there will never be any unconsumed input).
 */
export const parse = <Output>(
  parser: Parser<Output>,
  input: string,
): Either<InvalidInputError, Output> =>
  either.flatMap(parser(input, 0n), ({ output, offset, furthestFailure }) => {
    const excessContent: InvalidInputError = {
      source: input,
      offset,
      message: 'excess content followed valid input',
      expected: new Set(['end of input']),
      notes: [],
    }
    return Number(offset) !== input.length
      ? either.makeLeft(
          furthestFailure === undefined
            ? excessContent
            : furthest(furthestFailure, excessContent),
        )
      : either.makeRight(output)
  })
