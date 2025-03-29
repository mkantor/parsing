import * as either from '@matt.kantor/either'
import type { Parser, ParserWhichAlwaysSucceeds } from './parser.js'

export const anySingleCharacter: Parser<string> = input => {
  const firstCodePoint = input.codePointAt(0)
  if (firstCodePoint === undefined) {
    return either.makeLeft({
      input,
      message: 'input was empty',
    })
  } else {
    const firstCharacter = String.fromCodePoint(firstCodePoint)
    return either.makeRight({
      output: firstCharacter,
      remainingInput: input.slice(firstCharacter.length),
    })
  }
}

export const literal = <Text extends string>(text: Text): Parser<Text> => {
  const errorMessage = `input did not begin with "${text}"`
  return input =>
    input.startsWith(text)
      ? either.makeRight({
          remainingInput: input.slice(text.length),
          output: text,
        })
      : either.makeLeft({
          input,
          message: errorMessage,
        })
}

export const nothing: ParserWhichAlwaysSucceeds<undefined> = input =>
  either.makeRight({
    remainingInput: input,
    output: undefined,
  })

export const regularExpression = (pattern: RegExp): Parser<string> => {
  const patternAnchoredToStartOfString = pattern.source.startsWith('^')
    ? pattern
    : new RegExp(`^${pattern.source}`, pattern.flags)
  return input => {
    const match = patternAnchoredToStartOfString.exec(input)
    return match === null
      ? either.makeLeft({
          input,
          message: 'input did not match regular expression',
        })
      : either.makeRight({
          remainingInput: input.slice(match[0].length),
          output: match[0],
        })
  }
}
