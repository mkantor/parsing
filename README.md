# parsing

A [parser combinator](https://en.wikipedia.org/wiki/Parser_combinator) library.

## Usage Example

A simple calculator for addition and subtraction of natural numbers:
```ts
import either from '@matt.kantor/either'
import {
  lazy,
  literal,
  map,
  oneOf,
  oneOrMore,
  sequence,
  type Parser,
} from '@matt.kantor/parsing'

const operator = oneOf([literal('+'), literal('-')])

const number = map(
  oneOrMore(
    oneOf([
      literal('0'),
      literal('1'),
      literal('2'),
      literal('3'),
      literal('4'),
      literal('5'),
      literal('6'),
      literal('7'),
      literal('8'),
      literal('9'),
    ]),
  ),
  Number,
)

const compoundExpression = map(
  sequence([number, operator, lazy(() => expression)]),
  ([a, operator, b]) => {
    switch (operator) {
      case '+': return a + b
      case '-': return a - b
    }
  },
)

const expression: Parser<number> = oneOf([compoundExpression, number])

console.log(parse(expression, '2+2-1').value) // logs "3"
```
