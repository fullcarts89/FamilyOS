import { ComingNext } from '../../components/ComingNext';

export default function Contacts() {
  return (
    <ComingNext
      title="Contacts"
      line="The people the household relies on, in one place: the pediatrician, the daycare, the plumber, the sitter."
      points={[
        'Grouped by what they help with, each with the details you always need to look up.',
        'Linked to people and to the tasks that involve them.',
        'Shared with every adult in the household.',
      ]}
      lanes={[
        [
          [6, 40],
          [52, 30],
        ],
        [
          [12, 24],
          [44, 40],
        ],
        [[2, 70]],
      ]}
    />
  );
}
