import type { Either, Right } from '@matt.kantor/either'
import * as either from '@matt.kantor/either'

export type InvalidInputError = {
  readonly input: string
  readonly message: string
}

export type Parser<Output> = (
  input: string,
) => Either<InvalidInputError, Success<Output>>

export type ParserWhichAlwaysSucceeds<Output> = (
  input: string,
) => Right<Success<Output>>

export type Success<Output> = {
  readonly remainingInput: string
  readonly output: Output
}

/**
 * Apply `parser` to the given `input`, requiring it to consume the entire input
 * (all the way to the end of the string).
 *
 * Unlike `Parser`s, in the return value `Output` is not wrapped in `Success`
 * (there will never be any `remainingInput`).
 */
export const parse = <Output>(
  parser: Parser<Output>,
  input: string,
): Either<InvalidInputError, Output> =>
  either.flatMap(parser(input), ({ remainingInput, output }) =>
    remainingInput.length !== 0
      ? either.makeLeft({
          input,
          output,
          remainingInput,
          message: 'excess content followed valid input',
        })
      : either.makeRight(output),
  )
