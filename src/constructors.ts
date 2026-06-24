import * as either from '@matt.kantor/either'
import type { Parser, ParserWhichAlwaysSucceeds } from './parser.js'

export const anySingleCharacter: Parser<string> = (input, offset = 0n) => {
  const firstCodePoint = input.codePointAt(Number(offset))
  if (firstCodePoint === undefined) {
    return either.makeLeft({
      source: input,
      offset,
      message: 'unexpected end of input',
      expected: ['any character'],
    })
  } else {
    const firstCharacter = String.fromCodePoint(firstCodePoint)
    return either.makeRight({
      output: firstCharacter,
      offset: offset + BigInt(firstCharacter.length),
    })
  }
}

export const literal = <Text extends string>(text: Text): Parser<Text> => {
  const errorMessage = `input did not begin with \`${text}\``
  const expected = [`\`${text}\``]
  return (input, offset = 0n) =>
    input.startsWith(text, Number(offset))
      ? either.makeRight({
          output: text,
          offset: offset + BigInt(text.length),
        })
      : either.makeLeft({
          source: input,
          offset,
          message: errorMessage,
          expected,
        })
}

export const nothing: ParserWhichAlwaysSucceeds<undefined> = (
  _input,
  offset = 0n,
) =>
  either.makeRight({
    output: undefined,
    offset,
  })

export const regularExpression = (pattern: RegExp): Parser<string> => {
  // Match from the `offset` by enabling the sticky (`y`) flag and setting
  // `lastIndex` to `offset`.
  const stickyPattern = new RegExp(
    pattern.source,
    pattern.flags.includes('y') ? pattern.flags : `${pattern.flags}y`,
  )
  const expected = [`/${pattern.source}/`]
  return (input, offset = 0n) => {
    stickyPattern.lastIndex = Number(offset)
    const match = stickyPattern.exec(input)
    return match === null
      ? either.makeLeft({
          source: input,
          offset,
          message: 'input did not match regular expression',
          expected,
        })
      : either.makeRight({
          output: match[0],
          offset: offset + BigInt(match[0].length),
        })
  }
}
