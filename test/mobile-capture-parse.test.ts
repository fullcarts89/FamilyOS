import { describe, expect, it } from 'vitest';
import { parseCapture, withoutWords, type CapturePerson } from '../apps/mobile/lib/capture-parse';

// Quick capture's shorthand for a time and a length (lib/capture-parse.ts).
const TODAY = '2026-11-19';
const MAYA = '00000000-0000-4000-8000-000000000001';
const THEO = '00000000-0000-4000-8000-000000000002';

describe('quick capture: times and lengths', () => {
  const people: CapturePerson[] = [
    { id: MAYA, name: 'Maya Rivera', isMe: true },
    { id: THEO, name: 'Theo Rivera', isMe: false },
  ];
  const parse = (text: string) => parseCapture(text, TODAY, people, []);

  it('reads "at 5:30pm for 30 min" and takes them out of the title', () => {
    expect(parse('Walk Biscuit at 5:30pm for 30 min')).toMatchObject({
      title: 'Walk Biscuit',
      time: '17:30',
      durationMinutes: 30,
      dueOn: null,
    });
  });

  it('reads 24-hour times after "at", and am/pm times on their own', () => {
    expect(parse('Call the vet at 17:30')).toMatchObject({ title: 'Call the vet', time: '17:30' });
    expect(parse('Call the vet 5:30pm')).toMatchObject({ title: 'Call the vet', time: '17:30' });
    expect(parse('Gym at 6 am')).toMatchObject({ title: 'Gym', time: '06:00' });
    expect(parse('Pickup 12pm')).toMatchObject({ title: 'Pickup', time: '12:00' });
  });

  it('reads lengths in minutes and hours', () => {
    const length = (text: string) => parse(`Walk Biscuit at 5pm ${text}`).durationMinutes;
    expect(length('for 30 min')).toBe(30);
    expect(length('for 45 minutes')).toBe(45);
    expect(length('for 1 hour')).toBe(60);
    expect(length('for 1h')).toBe(60);
    expect(length('for 2 hours')).toBe(120);
    expect(length('for 1.5 hours')).toBe(90);
    expect(length('for 1h30')).toBe(90);
    expect(length('for an hour')).toBe(60);
    expect(length('for half an hour')).toBe(30);
    expect(parse('Walk Biscuit at 5pm for 1 hour').title).toBe('Walk Biscuit');
  });

  it('works with a day and a person in any order', () => {
    expect(parse('Walk Biscuit tomorrow at 7am for 45 min @theo')).toMatchObject({
      title: 'Walk Biscuit',
      dueOn: '2026-11-20',
      dueLabel: 'Tomorrow',
      time: '07:00',
      durationMinutes: 45,
      ownerId: THEO,
    });
    expect(parse('Take June to swim for me at 4:15pm for 1h')).toMatchObject({
      title: 'Take June to swim',
      ownerId: MAYA,
      time: '16:15',
      durationMinutes: 60,
    });
  });

  it('never takes "at" inside a word, or "at" without a clear time', () => {
    expect(parse('Feed the cat')).toMatchObject({ title: 'Feed the cat', time: null });
    expect(parse('Chat with Theo about the trip')).toMatchObject({
      title: 'Chat with Theo about the trip',
      time: null,
    });
    expect(parse('Wait at the station')).toMatchObject({
      title: 'Wait at the station',
      time: null,
    });
    // A bare number could be anything: it stays in the words.
    expect(parse('Dinner at 7')).toMatchObject({ title: 'Dinner at 7', time: null });
    expect(parse('Read psalm 3:16')).toMatchObject({ title: 'Read psalm 3:16', time: null });
    // "cat 5:30pm": the time is its own word, "cat" stays whole.
    expect(parse('Feed the cat 5:30pm')).toMatchObject({ title: 'Feed the cat', time: '17:30' });
    expect(parse('Format at17:30')).toMatchObject({ title: 'Format at17:30', time: null });
  });

  it('leaves a length in the words when there is no time to start from, or it isn’t one', () => {
    expect(parse('Practice piano for 30 min')).toMatchObject({
      title: 'Practice piano for 30 min',
      time: null,
      durationMinutes: null,
    });
    expect(parse('Dinner for 2 at 7pm')).toMatchObject({
      title: 'Dinner for 2',
      time: '19:00',
      durationMinutes: null,
    });
    // Not 5 to 720 minutes in fives: not a length the app takes.
    expect(parse('Stretch at 7am for 7 min')).toMatchObject({
      title: 'Stretch for 7 min',
      durationMinutes: null,
    });
    expect(parse('Drive at 6am for 13 hours').durationMinutes).toBeNull();
  });

  it('keeps the words it read for the time and the length', () => {
    expect(parse('Walk Biscuit at 5:30pm for 30 min')).toMatchObject({
      timeWords: 'at 5:30pm',
      lengthWords: 'for 30 min',
    });
    expect(parse('5pm walk Biscuit')).toMatchObject({ timeWords: '5pm', lengthWords: null });
    expect(parse('Walk Biscuit')).toMatchObject({ timeWords: null, lengthWords: null });
  });
});

describe('quick capture: a picked time replaces a typed one', () => {
  const people: CapturePerson[] = [{ id: MAYA, name: 'Maya Rivera', isMe: true }];
  const parse = (text: string) => parseCapture(text, TODAY, people, []);
  const pickInstead = (text: string) => {
    const p = parse(text);
    return withoutWords(text, p.timeWords, p.lengthWords);
  };

  it('takes out the typed time and length, and leaves everything else as typed', () => {
    expect(pickInstead('Walk Biscuit at 5:30pm for 30 min')).toBe('Walk Biscuit');
    expect(pickInstead('Walk Biscuit tomorrow at 7am for 45 min @maya')).toBe(
      'Walk Biscuit tomorrow @maya',
    );
    expect(pickInstead('5pm walk Biscuit')).toBe('walk Biscuit');
    expect(pickInstead('Dinner for 2 at 7pm')).toBe('Dinner for 2');
    // Nothing read: nothing taken out.
    expect(pickInstead('Wait at the station')).toBe('Wait at the station');
  });

  it('takes out only whole words, and only the first match', () => {
    expect(withoutWords('Chat at 5pm', 'at 5pm')).toBe('Chat');
    expect(withoutWords('Format at 5pm', 'at 5pm')).toBe('Format');
    expect(withoutWords('Pick up at 5pm, then at 5pm again', 'at 5pm')).toBe(
      'Pick up at 5pm, then again',
    );
    expect(withoutWords('Walk for 30 min at 5pm', 'for 30 min')).toBe('Walk at 5pm');
  });

  it('what is left reads the same, without a time', () => {
    const left = pickInstead('Call the vet tomorrow at 17:30 for 1 hour !');
    expect(parse(left)).toMatchObject({
      title: 'Call the vet',
      dueLabel: 'Tomorrow',
      time: null,
      durationMinutes: null,
      important: true,
    });
  });
});
