import type { Either, Right } from '@matt.kantor/either'

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
