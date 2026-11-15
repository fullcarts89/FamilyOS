import { ComingNext } from '../../components/ComingNext';

export default function Week() {
  return (
    <ComingNext
      title="Week"
      line="Seven days of the same lanes, side by side: who has the children each morning and evening, and where the week gets tight."
      points={[
        'Every event and drop-off in one board, one lane per person.',
        'Recurring events, handoffs and one-off cover when plans change.',
        'Overlaps drawn as hatching, so a clash is visible before it bites.',
      ]}
      lanes={[
        [
          [8, 22],
          [34, 18],
          [62, 12],
        ],
        [
          [10, 30],
          [48, 8],
          [70, 14],
        ],
        [
          [4, 14],
          [20, 52],
          [78, 18],
        ],
      ]}
    />
  );
}
