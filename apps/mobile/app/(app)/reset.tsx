import { ComingNext } from '../../components/ComingNext';

export default function Reset() {
  return (
    <ComingNext
      title="Weekly Reset"
      line="Twenty minutes on Sunday to look back, sort loose ends, decide together and agree who covers what next week."
      points={[
        'Look back at what got done and what slipped, from what you both actually finished.',
        'Loose ends, decisions you vote on together, and who covers each drop-off and pickup.',
        'Dinners and groceries, then commit the plan so everyone sees the same week.',
      ]}
      lanes={[
        [
          [4, 12],
          [20, 12],
          [36, 12],
          [52, 12],
          [68, 12],
        ],
        [
          [12, 20],
          [40, 26],
          [72, 16],
        ],
        [
          [6, 30],
          [44, 14],
          [66, 26],
        ],
      ]}
      next={{ label: 'Open Tasks', href: '/tasks' }}
    />
  );
}
