import { ComingNext } from '../../components/ComingNext';

export default function Meals() {
  return (
    <ComingNext
      title="Meals"
      line="Dinners as a row in the week, who cooks, and one grocery list you both add to at the store."
      points={[
        'Plan the week’s dinners during the Weekly Reset.',
        'One shared grocery list, sorted by aisle, ticked off together.',
        'Who cooks each night, in their own color.',
      ]}
      lanes={[
        [[70, 12]],
        [
          [64, 14],
          [82, 8],
        ],
        [[66, 16]],
      ]}
    />
  );
}
