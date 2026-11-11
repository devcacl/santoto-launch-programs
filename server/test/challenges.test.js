import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validChallengeAnswer } from '../src/challenges.js';

const event = JSON.parse(await readFile(new URL('../src/config/event.json', import.meta.url), 'utf8'));
const acceptedAnswers = new Map([
  ['plate-builder', ['arroz', 'frijoles', 'tomate']],
  ['market-basket', ['lentejas', 'maiz', 'manzana']],
  ['safe-route', ['wash', 'prepare', 'cook', 'store']],
  ['nutrient-match', { energy: 'grains', variety: 'produce', hydration: 'water', fiber: 'whole', context: 'family' }],
  ['balanced-snack', { energy: 4, fresh: 4, protein: 4 }],
  ['dashboard-detective', 'checkout'],
  ['budget-allocation', { research: 3, pilot: 4, measure: 3 }],
  ['evidence-headline', 'sales-up|returns-down'],
  ['metric-match', { conversion: 'desired-action', abandonment: 'drop-off', retention: 'returning', basket: 'amount', service: 'speed' }],
  ['insight-sequence', ['ask', 'collect', 'clean', 'analyze', 'communicate']],
]);

function invalidVariant(challenge, answer) {
  if (challenge.type === 'builder' || challenge.type === 'market') return [];
  if (challenge.type === 'sequence') return [...answer].reverse();
  if (challenge.type === 'match') {
    const invalid = { ...answer };
    const [first, second] = Object.keys(invalid);
    [invalid[first], invalid[second]] = [invalid[second], invalid[first]];
    return invalid;
  }
  if (challenge.type === 'detective') return '__invalid_option__';
  if (challenge.type === 'allocation') return { ...answer, unexpected: 1 };
  if (challenge.type === 'headline') return `${answer}?`;
  return null;
}

test('event configuration exposes the launch and the program leaders talk', () => {
  assert.equal(event.eventName, 'EVOLUCIONA-T');
  assert.equal(event.talks.length, 1);
  assert.equal(event.talks[0].id, 'program-leaders');
  assert.match(event.talks[0].speaker, /Luis Rafael Hutchison/);
  assert.match(event.talks[0].speaker, /Esperanza Díaz Casallas/);
  assert.match(event.privacyUrl, /^https:\/\//);
  assert.equal(new Set(event.programs.map((program) => program.id)).size, event.programs.length);
});

for (const program of event.programs) {
  for (const challenge of program.challenges) {
    test(`${program.id}/${challenge.id} accepts valid answers and rejects invalid answers`, () => {
      const answer = acceptedAnswers.get(challenge.id);
      assert.notEqual(answer, undefined, `Missing test answer for ${challenge.id}`);
      assert.equal(validChallengeAnswer(challenge, answer), true, 'expected the documented answer to be accepted');
      assert.equal(validChallengeAnswer(challenge, invalidVariant(challenge, answer)), false, 'expected an invalid answer to be rejected');
    });
  }
}

test('unknown challenge types fail closed', () => {
  assert.equal(validChallengeAnswer({ type: 'unknown', items: [], rules: {} }, {}), false);
});
