import type { Either, Right } from '@matt.kantor/either'
import * as either from '@matt.kantor/either'

export type InvalidInputError = {
  readonly source: string
  readonly offset: bigint
  readonly message: string
  readonly expected: readonly string[]
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
  either.flatMap(parser(input, 0n), ({ output, offset }) =>
    Number(offset) !== input.length
      ? either.makeLeft({
          source: input,
          offset,
          message: 'excess content followed valid input',
          expected: ['end of input'],
        })
      : either.makeRight(output),
  )
