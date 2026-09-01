import type { InvalidInputError, Note } from './parser.js'

export const messageForExpectations = (
  expected: ReadonlySet<string>,
): string => {
  const [onlyExpectation, ...otherExpectations] = expected
  return onlyExpectation === undefined
    ? 'unexpected input'
    : otherExpectations.length === 0
      ? `expected ${onlyExpectation}`
      : `expected one of: ${[...expected].join(', ')}`
}

/**
 * The furthest of two failures, or a merged error when they tie.
 */
export const furthest = (
  first: InvalidInputError,
  second: InvalidInputError,
): InvalidInputError =>
  first.offset > second.offset
    ? first
    : second.offset > first.offset
      ? second
      : mergeErrors(first, second)

export const furthestOrUndefined = (
  first: InvalidInputError | undefined,
  second: InvalidInputError | undefined,
): InvalidInputError | undefined =>
  second === undefined
    ? first
    : first === undefined
      ? second
      : furthest(first, second)

export const deduplicateNotes = (notes: readonly Note[]): readonly Note[] =>
  notes.filter(
    (note, index) =>
      notes.findIndex(
        otherNote =>
          otherNote.offset === note.offset &&
          otherNote.message === note.message,
      ) === index,
  )

const mergeErrors = (
  first: InvalidInputError,
  second: InvalidInputError,
): InvalidInputError => {
  const expected = new Set([...first.expected, ...second.expected])
  return {
    source: first.source,
    offset: first.offset,
    message: messageForExpectations(expected),
    expected,
    notes:
      first.notes.length === 0
        ? second.notes
        : second.notes.length === 0
          ? first.notes
          : deduplicateNotes([...first.notes, ...second.notes]),
  }
}
