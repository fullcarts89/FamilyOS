import { ComingNext } from '../../components/ComingNext';

export default function Budgets() {
  return (
    <ComingNext
      title="Budgets"
      line="A calm read of this month’s budget from Monarch, so money questions come up in the Weekly Reset rather than at midnight."
      points={[
        'Read-only: FamilyOS never moves money or changes your budget.',
        'One line in Today, one step in the Weekly Reset.',
        'A CSV upload if you’d rather not connect an account.',
      ]}
      lanes={[[[0, 62]], [[0, 38]], [[0, 81]]]}
    />
  );
}
