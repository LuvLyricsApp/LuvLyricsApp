import { choiceColumns } from './choiceLayout';

describe('choiceColumns', () => {
  it('puts one or two options on a row', () => {
    expect(choiceColumns(['Live shader'])).toBe(1);
    expect(choiceColumns(['Live shader', 'Frosted glass'])).toBe(2);
  });

  it('keeps three short options on one row', () => {
    expect(choiceColumns(['Left', 'Centre', 'Right'])).toBe(3);
    expect(choiceColumns(['Tight', 'Normal', 'Airy'])).toBe(3);
  });

  it('gives three options with a long label a grid, so nothing is cut off', () => {
    expect(choiceColumns(['Live shader', 'Frosted glass', 'Glow'])).toBe(2);
  });

  it('lays four or more out in two columns', () => {
    expect(choiceColumns(['Apple Music', 'Apple + glow', 'YouTube Music', 'Shader wash'])).toBe(2);
    expect(choiceColumns(['a', 'b', 'c', 'd', 'e'])).toBe(2);
  });
});
