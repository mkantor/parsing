import either, { type Either } from '@matt.kantor/either'
import { nothing } from './constructors.js'
import type {
  AlwaysSucceedingParser,
  InvalidInputError,
  Parser,
  Success,
} from './parser.js'

export const as =
  <NewOutput>(
    parser: Parser<unknown>,
    newOutput: NewOutput,
  ): Parser<NewOutput> =>
  input =>
    either.map(parser(input), success => ({
      output: newOutput,
      remainingInput: success.remainingInput,
    }))

export const butNot =
  <Output>(
    parser: Parser<Output>,
    not: Parser<unknown>,
    notName: string,
  ): Parser<Output> =>
  input =>
    either.flatMap(parser(input), success => {
      const notResult = not(input)
      if (!either.isLeft(notResult)) {
        return either.makeLeft({
          input,
          message: `input was unexpectedly ${notName}`,
        })
      } else {
        return either.makeRight(success)
      }
    })

export const flatMap =
  <Output, NewOutput>(
    parser: Parser<Output>,
    f: (output: Output) => Parser<NewOutput>,
  ): Parser<NewOutput> =>
  input =>
    either.flatMap(parser(input), success => {
      const nextParser = f(success.output)
      return nextParser(success.remainingInput)
    })

export const lazy =
  <Output>(parser: () => Parser<Output>): Parser<Output> =>
  input =>
    parser()(input)

export const lookaheadNot =
  <Output>(
    parser: Parser<Output>,
    notFollowedBy: Parser<unknown>,
    followedByName: string,
  ): Parser<Output> =>
  input =>
    either.flatMap(parser(input), success =>
      either.match(notFollowedBy(success.remainingInput), {
        left: _ => either.makeRight(success),
        right: _ =>
          either.makeLeft({
            input,
            message: `input was unexpectedly followed by ${followedByName}`,
          }),
      }),
    )

export const map =
  <Output, NewOutput>(
    parser: Parser<Output>,
    f: (output: Output) => NewOutput,
  ): Parser<NewOutput> =>
  input =>
    either.map(parser(input), success => ({
      output: f(success.output),
      remainingInput: success.remainingInput,
    }))

/**
 * Apply the given `parsers` to the same input until one succeeds or all fail.
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
  input =>
    parsers.reduce(
      (result: ReturnType<Parser<OneOfOutput<Parsers>>>, parser) =>
        either.match(result, {
          right: either.makeRight,
          left: _ => parser(input),
        }),
      either.makeLeft({ input, message: '' }), // `parsers` is non-empty so this is never returned
    )
type OneOfOutput<Parsers extends readonly Parser<unknown>[]> = {
  [Index in keyof Parsers]: OutputOf<Parsers[Index]>
}[number]

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
  input =>
    either.map(
      parsers.reduce(
        (
          results: ReturnType<
            Parser<readonly SequenceOutput<Parsers>[number][]>
          >,
          parser,
        ) =>
          either.match(results, {
            right: successes =>
              either.map(parser(successes.remainingInput), newSuccess => ({
                remainingInput: newSuccess.remainingInput,
                output: [...successes.output, newSuccess.output],
              })),
            left: either.makeLeft,
          }),
        either.makeRight({ remainingInput: input, output: [] }), // `parsers` is non-empty so this is never returned
      ),
      ({ output, remainingInput }) => ({
        // The above `reduce` callback constructs `output` such that its
        // elements align with `Parsers`, but TypeScript doesn't know that.
        output: output as SequenceOutput<Parsers>,
        remainingInput,
      }),
    )
type SequenceOutput<Parsers extends readonly Parser<unknown>[]> = {
  [Index in keyof Parsers]: OutputOf<Parsers[Index]>
}

export const transformOutput =
  <Output, NewOutput>(
    parser: Parser<Output>,
    f: (output: Output) => Either<InvalidInputError, NewOutput>,
  ): Parser<NewOutput> =>
  input =>
    either.flatMap(parser(input), success =>
      either.map(f(success.output), output => ({
        output,
        remainingInput: success.remainingInput,
      })),
    )

export const zeroOrMore =
  <Output>(parser: Parser<Output>): AlwaysSucceedingParser<readonly Output[]> =>
  input => {
    const result = oneOf([parser, nothing])(input)
    const success = either.match(result, {
      left: _ => ({
        output: [],
        remainingInput: input,
      }),
      right: lastSuccess => {
        if (lastSuccess.output === undefined) {
          return {
            output: [],
            remainingInput: lastSuccess.remainingInput,
          }
        } else {
          const nextResult = zeroOrMore(parser)(lastSuccess.remainingInput)
          return {
            output: [lastSuccess.output, ...nextResult.value.output],
            remainingInput: nextResult.value.remainingInput,
          }
        }
      },
    })
    return either.makeRight(success)
  }

type OutputOf<SpecificParser extends Parser<unknown>> = Extract<
  ReturnType<SpecificParser>['value'],
  Success<unknown>
>['output']
